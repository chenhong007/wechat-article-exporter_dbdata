#!/bin/bash

#############################################
# 微信文章导出工具 - 自动编译部署脚本
#############################################
# 功能：
# - 自动检测代码变化
# - 停止旧容器
# - 重新构建 Docker 镜像
# - 启动新容器
# - 验证部署状态
#############################################

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目配置
PROJECT_DIR="/home/wechat-article-exporter"
CONTAINER_NAME="wechat-article-exporter"
IMAGE_NAME="wechat-article-exporter"

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# 打印分隔线
print_separator() {
    echo -e "${BLUE}============================================${NC}"
}

# 检查 Docker 是否运行
check_docker() {
    log_info "检查 Docker 状态..."
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker 未运行，请先启动 Docker 服务"
        exit 1
    fi
    log_success "Docker 运行正常"
}

# 检查代码变化
check_git_changes() {
    log_info "检查代码变化..."
    cd "$PROJECT_DIR"
    
    if git diff --quiet && git diff --cached --quiet; then
        log_warning "没有检测到代码变化"
        read -p "是否仍然继续部署？(y/n/q) [y=继续, n=跳过构建仅重启, q=退出]: " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Qq]$ ]]; then
            log_info "部署已取消"
            exit 0
        elif [[ $REPLY =~ ^[Nn]$ ]]; then
            log_info "跳过构建步骤，仅重启容器"
            SKIP_BUILD=true
        else
            log_info "继续完整部署流程"
            FORCE_REBUILD=${FORCE_REBUILD:-false}
        fi
    else
        log_info "检测到以下文件变化："
        git status --short | head -20
        if [ $(git status --short | wc -l) -gt 20 ]; then
            echo "... (共 $(git status --short | wc -l) 个文件)"
        fi
        
        # 检查是否只是非关键文件变化
        local changed_files=$(git status --short | awk '{print $2}')
        if ! echo "$changed_files" | grep -qE "(\.ts|\.tsx|\.vue|\.js|\.jsx|package\.json|yarn\.lock|Dockerfile|docker-compose\.yml|nuxt\.config|tsconfig\.json)"; then
            log_info "仅检测到非关键文件变化（如文档、配置等）"
            read -p "是否跳过构建步骤？(y/n) [y=跳过构建, n=完整重建]: " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                log_info "跳过构建步骤"
                SKIP_BUILD=true
            fi
        fi
    fi
}

# 备份数据库
backup_database() {
    log_info "备份数据库..."
    if [ -f "$PROJECT_DIR/data/db.sqlite" ]; then
        BACKUP_FILE="$PROJECT_DIR/data/db.sqlite.backup-$(date '+%Y%m%d-%H%M%S')"
        cp "$PROJECT_DIR/data/db.sqlite" "$BACKUP_FILE"
        log_success "数据库已备份到: $BACKUP_FILE"
    else
        log_warning "未找到数据库文件，跳过备份"
    fi
}

# 停止旧容器
stop_old_container() {
    log_info "停止旧容器..."
    if docker ps -a | grep -q "$CONTAINER_NAME"; then
        docker stop "$CONTAINER_NAME" 2>/dev/null || true
        docker rm "$CONTAINER_NAME" 2>/dev/null || true
        log_success "旧容器已停止并删除"
    else
        log_info "未发现运行中的容器"
    fi
}

# 清理旧镜像
clean_old_images() {
    log_info "清理旧镜像..."
    # 保留最新的镜像，删除旧的
    OLD_IMAGES=$(docker images "$IMAGE_NAME" --format "{{.ID}}" | tail -n +3)
    if [ -n "$OLD_IMAGES" ]; then
        echo "$OLD_IMAGES" | xargs docker rmi -f 2>/dev/null || true
        log_success "已清理旧镜像"
    else
        log_info "没有需要清理的旧镜像"
    fi
}

# 检查是否需要重新构建
check_rebuild_needed() {
    log_info "检查是否需要重新构建..."
    
    # 检查镜像是否存在
    if ! docker images "$IMAGE_NAME" | grep -q "$IMAGE_NAME"; then
        log_info "镜像不存在，需要构建"
        return 0
    fi
    
    # 检查关键文件是否有变化
    local rebuild_needed=false
    local changed_files=$(git diff --name-only HEAD 2>/dev/null || echo "")
    
    if echo "$changed_files" | grep -qE "(package\.json|yarn\.lock|Dockerfile|docker-compose\.yml|nuxt\.config|tsconfig\.json)"; then
        log_info "检测到关键文件变化，需要重新构建"
        rebuild_needed=true
    elif [ -n "$changed_files" ]; then
        log_info "检测到代码变化，建议重新构建"
        rebuild_needed=true
    fi
    
    if [ "$rebuild_needed" = true ]; then
        return 0
    else
        log_warning "未检测到需要重新构建的变化"
        return 1
    fi
}

# 构建 Docker 镜像
build_image() {
    log_info "开始构建 Docker 镜像..."
    print_separator
    cd "$PROJECT_DIR"
    
    # 记录开始时间
    START_TIME=$(date +%s)
    
    # 启用pipefail，确保管道中任何命令失败都会被检测到
    set -o pipefail
    
    # 构建镜像，最多重试3次（处理npm registry临时错误）
    local max_retries=3
    local retry=0
    local build_success=false
    
    # 默认使用缓存构建，除非明确指定强制重建
    local build_args=""
    if [ "$FORCE_REBUILD" = "true" ]; then
        log_info "强制重新构建（不使用缓存）"
        build_args="--no-cache"
    else
        log_info "使用缓存构建（更快）"
        build_args=""
    fi
    
    while [ $retry -lt $max_retries ]; do
        if [ $retry -gt 0 ]; then
            log_info "第 $((retry + 1)) 次尝试构建..."
            sleep 5  # 等待5秒后重试
        fi
        
        # 构建镜像并保存日志
        if docker compose build $build_args 2>&1 | tee /tmp/docker-build.log; then
            build_success=true
            break
        else
            retry=$((retry + 1))
            if [ $retry -lt $max_retries ]; then
                log_warning "构建失败，将在5秒后重试 ($retry/$max_retries)..."
            fi
        fi
    done
    
    # 恢复pipefail设置
    set +o pipefail
    
    if [ "$build_success" = true ]; then
        END_TIME=$(date +%s)
        DURATION=$((END_TIME - START_TIME))
        log_success "镜像构建成功 (耗时: ${DURATION}s)"
        print_separator
    else
        log_error "镜像构建失败（已重试 $max_retries 次），请查看日志: /tmp/docker-build.log"
        exit 1
    fi
}

# 启动容器
start_container() {
    log_info "启动新容器..."
    cd "$PROJECT_DIR"
    
    if docker compose up -d; then
        log_success "容器启动成功"
    else
        log_error "容器启动失败"
        exit 1
    fi
}

# 等待容器就绪
wait_for_container() {
    log_info "等待容器就绪..."
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if docker ps | grep -q "$CONTAINER_NAME"; then
            if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
                log_success "容器已就绪"
                return 0
            fi
        fi
        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done
    
    echo ""
    log_error "容器启动超时"
    return 1
}

# 验证部署
verify_deployment() {
    log_info "验证部署状态..."
    print_separator
    
    # 1. 检查容器状态
    echo -e "${BLUE}容器状态:${NC}"
    docker ps | grep -E "CONTAINER|$CONTAINER_NAME"
    echo ""
    
    # 2. 检查容器日志
    echo -e "${BLUE}容器日志 (最后 20 行):${NC}"
    docker logs "$CONTAINER_NAME" --tail 20
    echo ""
    
    # 3. 检查 KV 目录
    echo -e "${BLUE}KV 存储目录:${NC}"
    docker exec "$CONTAINER_NAME" ls -la /app/.data/ 2>&1 || log_warning "无法访问容器目录"
    echo ""
    
    # 4. 测试 API
    echo -e "${BLUE}API 测试:${NC}"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)
    if [ "$HTTP_CODE" = "200" ]; then
        log_success "API 响应正常 (HTTP $HTTP_CODE)"
    else
        log_error "API 响应异常 (HTTP $HTTP_CODE)"
    fi
    
    print_separator
}

# 显示部署信息
show_deployment_info() {
    print_separator
    log_success "🎉 部署完成！"
    print_separator
    echo ""
    echo -e "${GREEN}访问地址:${NC}"
    echo -e "  • 本地: http://localhost:3000"
    echo -e "  • 服务器: http://wx.topai.ink"
    echo ""
    echo -e "${BLUE}常用命令:${NC}"
    echo -e "  • 查看日志: ${YELLOW}docker logs -f $CONTAINER_NAME${NC}"
    echo -e "  • 重启容器: ${YELLOW}docker restart $CONTAINER_NAME${NC}"
    echo -e "  • 进入容器: ${YELLOW}docker exec -it $CONTAINER_NAME sh${NC}"
    echo -e "  • 停止容器: ${YELLOW}docker stop $CONTAINER_NAME${NC}"
    echo ""
    print_separator
}

# 主函数
main() {
    print_separator
    echo -e "${GREEN}微信文章导出工具 - 自动部署${NC}"
    print_separator
    echo ""
    
    # 解析命令行参数
    FORCE_REBUILD=false
    SKIP_BUILD=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force|-f)
                FORCE_REBUILD=true
                log_info "启用强制重建模式"
                shift
                ;;
            --no-build|-nb)
                SKIP_BUILD=true
                log_info "跳过构建步骤"
                shift
                ;;
            --help|-h)
                echo "用法: $0 [选项]"
                echo "选项:"
                echo "  -f, --force      强制重新构建（不使用缓存）"
                echo "  -nb, --no-build  跳过构建步骤，仅重启容器"
                echo "  -h, --help       显示此帮助信息"
                exit 0
                ;;
            *)
                log_error "未知选项: $1"
                echo "使用 --help 查看帮助"
                exit 1
                ;;
        esac
    done
    
    # 执行部署流程
    check_docker
    check_git_changes
    backup_database
    stop_old_container
    
    # 根据标志决定是否构建
    if [ "$SKIP_BUILD" = true ]; then
        log_info "跳过镜像构建和清理步骤"
    else
        clean_old_images
        build_image
    fi
    
    start_container
    
    # 等待并验证
    if wait_for_container; then
        verify_deployment
        show_deployment_info
    else
        log_error "部署失败，请检查日志"
        docker logs "$CONTAINER_NAME" --tail 50
        exit 1
    fi
}

# 错误处理
trap 'log_error "脚本执行失败，正在回滚..."; docker logs "$CONTAINER_NAME" --tail 30 2>/dev/null || true; exit 1' ERR

# 运行主函数
main "$@"
