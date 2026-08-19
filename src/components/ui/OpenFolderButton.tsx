import { useTranslation } from 'react-i18next';
import { useFileExists } from '@/app/hooks/useFileExists';
import { openFolderContaining } from '@/core/native/api';
import { Icon } from './Icon';

interface OpenFolderButtonProps {
  path?: string;
}

export function OpenFolderButton({ path }: OpenFolderButtonProps) {
  const { t } = useTranslation();
  const exists = useFileExists(path);

  if (!path || !exists) return null;

  return (
    <button
      type="button"
      className="icon-button"
      aria-label={t('openFolder')}
      title={t('openFolder')}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void openFolderContaining(path);
      }}
    >
      <Icon name="folder" />
    </button>
  );
}
