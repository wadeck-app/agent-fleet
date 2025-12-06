import { ReactNode } from 'react';
import './Panel.css';

interface PanelProps {
  title?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
  footer?: ReactNode;
}

export function Panel({ title, children, className = '', actions, footer }: PanelProps) {
  return (
    <div className={`panel ${className}`}>
      {title && (
        <div className="panel-header">
          <h2 className="panel-title">{title}</h2>
          {actions && <div className="panel-actions">{actions}</div>}
        </div>
      )}
      <div className="panel-content">{children}</div>
      {footer && <div className="panel-footer">{footer}</div>}
    </div>
  );
}
