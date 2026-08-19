import { useTranslation } from 'react-i18next';
import type { FileReport } from '@/core/domain/types';
import { useFileIcon } from '@/app/hooks/useFileIcon';
import { detectFileKind } from '@/app/utils/fileKind';
import { detectionCount, engineTotal, formatDateTime, formatSize } from '@/app/utils/format';
import { verdictTone } from '@/app/utils/verdict';
import { Icon } from './Icon';
import { OpenFolderButton } from './OpenFolderButton';
import { ScanRow } from './ScanRow';

interface FileReportRowProps {
  report: FileReport;
  onOpen: (report: FileReport) => void;
  onRemove?: (report: FileReport) => void;
}

export function FileReportRow({ report, onOpen, onRemove }: FileReportRowProps) {
  const { t } = useTranslation();
  const kind = report.fileKind ?? detectFileKind(report.name);
  const tone = verdictTone(report.verdict);
  const sizeLabel = report.size > 0 ? formatSize(report.size) : null;
  const meta = [report.type, sizeLabel, formatDateTime(report.scannedAt)].filter(Boolean).join(' · ');
  const nativeIcon = useFileIcon(report.path);

  return (
    <ScanRow
      name={report.name}
      kind={kind}
      tone={tone}
      meta={meta}
      nativeIcon={nativeIcon}
      summary={`${detectionCount(report)}/${engineTotal(report)} ${t('engines')}`}
      onOpen={() => onOpen(report)}
      actions={
        <>
          <span className={`pill ${tone}`}>{t(report.verdict)}</span>
          <OpenFolderButton path={report.path} />
          {onRemove ? (
            <button
              type="button"
              className="icon-button danger"
              aria-label={t('removeReport')}
              title={t('removeReport')}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRemove(report);
              }}
            >
              <Icon name="close" />
            </button>
          ) : null}
        </>
      }
    />
  );
}
