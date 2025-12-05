#!/bin/bash

#############################################
# 微信文章导出工具 - 自动监控部署脚本
#############################################
# 功能：
# - 监控指定目录的文件变化
# - 自动触发编译和部署
# - 支持忽略特定文件/目录
#############################################

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
PROJECT_DIR="/home/wechat-article-exporter"
DEPLOY_SCRIPT="$PROJECT_DIR/auto-deploy.sh"
DEBOUNCE_TIME=5  # 防抖时间（秒）

# 要监控的目录
WATCH_DIRS=(
    "$PROJECT_DIR/server"
    "$PROJECT_DIR/pages"
    "$PROJECT_DIR/components"
    "$PROJECT_DIR/composables"
    "$PROJECT_DIR/utils"
    "$PROJECT_DIR/types"
    "$PROJECT_DIR/store"
    "$PROJECT_DIR/config"
)

# 要监控的单个文件
WATCH_FILES=(
    "$PROJECT_DIR/nuxt.config.ts"
    "$PROJECT_DIR/nitro.config.ts"
    "$PROJECT_DIR/package.json"
    "$PROJECT_DIR/Dockerfile"
    "$PROJECT_DIR/docker-compose.yml"
)

# 忽略的模式
IGNORE_PATTERNS=(
    "*.log"
    "*.tmp"
    "*.swp"
    "*~"
    ".git/*"
    "node_modules/*"
    ".nuxt/*"
    ".output/*"
    "data/*"
)

log_info() {
    echo -e "${BLUE}[监控]${NC} $(date '+%H:%M:%S') - $1"
}

log_success() {
    echo -e "${GREEN}[成功]${NC} $(date '+%H:%M:%S') - $1"
}

log_warning() {
    echo -e "${YELLOW}[警告]${NC} $(date '+%H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[错误]${NC} $(date '+%H:%M:%S') - $1"
}

# 检查依赖
check_dependencies() {
    if ! command -v inotifywait &> /dev/null; then
        log_warning "inotify-tools 未安装，正在安装..."
        apt-get update -qq && apt-get install -y inotify-tools
        log_success "inotify-tools 安装完成"
    fi
    
    if [ ! -f "$DEPLOY_SCRIPT" ]; then
        log_error "部署脚本不存在: $DEPLOY_SCRIPT"
        exit 1
    fi
    
    chmod +x "$DEPLOY_SCRIPT"
}

# 构建 inotifywait 命令
build_watch_command() {
    local cmd="inotifywait -m -r -e modify,create,delete,move"
    
    # 添加忽略模式
    for pattern in "${IGNORE_PATTERNS[@]}"; do
        cmd="$cmd --exclude '$pattern'"
    done
    
    # 添加监控目录
    for dir in "${WATCH_DIRS[@]}"; do
        if [ -d "$dir" ]; then
            cmd="$cmd $dir"
        fi
    done
    
    # 添加监控文件
    for file in "${WATCH_FILES[@]}"; do
        if [ -f "$file" ]; then
            cmd="$cmd $file"
        fi
    done
    
    echo "$cmd"
}

# 执行部署
deploy() {
    log_info "检测到文件变化，准备部署..."
    log_info "等待 ${DEBOUNCE_TIME} 秒以收集更多变化..."
    sleep "$DEBOUNCE_TIME"
    
    log_info "开始执行部署..."
    if bash "$DEPLOY_SCRIPT"; then
        log_success "部署成功"
    else
        log_error "部署失败"
    fi
}

# 主监控循环
watch_and_deploy() {
    log_info "开始监控文件变化..."
    log_info "监控目录: ${#WATCH_DIRS[@]} 个"
    log_info "监控文件: ${#WATCH_FILES[@]} 个"
    log_info "按 Ctrl+C 停止监控"
    echo ""
    
    local last_deploy_time=0
    local watch_cmd=$(build_watch_command)
    
    eval "$watch_cmd" | while read -r directory event filename; do
        current_time=$(date +%s)
        time_diff=$((current_time - last_deploy_time))
        
        # 显示变化
        log_info "文件变化: $directory$filename ($event)"
        
        # 防抖：如果距离上次部署时间太短，跳过
        if [ $time_diff -lt $((DEBOUNCE_TIME * 2)) ]; then
            continue
        fi
        
        # 触发部署
        deploy
        last_deploy_time=$(date +%s)
        
        echo ""
        log_info "继续监控..."
    done
}

# 显示使用说明
show_usage() {
    echo "使用方法:"
    echo "  $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help     显示此帮助信息"
    echo "  -t, --test     测试模式（不执行部署）"
    echo "  -d, --debounce 设置防抖时间（秒，默认: $DEBOUNCE_TIME）"
    echo ""
    echo "示例:"
    echo "  $0                    # 启动监控"
    echo "  $0 -d 10              # 设置 10 秒防抖时间"
    echo "  $0 -t                 # 测试模式"
}

# 解析命令行参数
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_usage
                exit 0
                ;;
            -t|--test)
                log_info "测试模式已启用"
                DEPLOY_SCRIPT="echo '[测试] 模拟部署'"
                shift
                ;;
            -d|--debounce)
                DEBOUNCE_TIME="$2"
                log_info "防抖时间设置为: ${DEBOUNCE_TIME}s"
                shift 2
                ;;
            *)
                log_error "未知参数: $1"
                show_usage
                exit 1
                ;;
        esac
    done
}

# 主函数
main() {
    echo -e "${GREEN}================================${NC}"
    echo -e "${GREEN}文件监控自动部署${NC}"
    echo -e "${GREEN}================================${NC}"
    echo ""
    
    parse_args "$@"
    check_dependencies
    watch_and_deploy
}

# 捕获退出信号
trap 'echo ""; log_info "停止监控..."; exit 0' INT TERM

# 运行
main "$@"
