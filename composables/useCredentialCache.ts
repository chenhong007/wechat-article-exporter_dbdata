import { StorageSerializers } from '@vueuse/core';
import type { ParsedCredential } from '~/types/credential';

export default () => {
  const credentials = useLocalStorage<ParsedCredential[]>(
    'auto-detect-credentials:credentials',
    [],
    {
      serializer: StorageSerializers.object,
    }
  );

  function setCredentials(list: ParsedCredential[]) {
    credentials.value = Array.isArray(list) ? list : [];
  }

  function mergeCredentials(list: ParsedCredential[]) {
    if (!Array.isArray(list) || list.length === 0) return;

    const merged = new Map<string, ParsedCredential>();
    for (const item of credentials.value) {
      if (item?.biz) {
        merged.set(item.biz, item);
      }
    }
    for (const item of list) {
      if (!item?.biz) continue;
      const existing = merged.get(item.biz);
      if (!existing || (existing.timestamp || 0) < (item.timestamp || 0)) {
        merged.set(item.biz, { ...existing, ...item });
      }
    }
    credentials.value = Array.from(merged.values());
  }

  return {
    credentials,
    setCredentials,
    mergeCredentials,
  };
};
