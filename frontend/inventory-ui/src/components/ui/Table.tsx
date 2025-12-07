import { ReactNode } from 'react';
import styles from './Table.module.scss';

export interface TableProps {
  children: ReactNode;
}

export interface TableHeaderProps {
  children: ReactNode;
}

export interface TableBodyProps {
  children: ReactNode;
}

export interface TableRowProps {
  children: ReactNode;
  onClick?: () => void;
}

export interface TableHeadProps {
  children: ReactNode;
  sortable?: boolean;
  onSort?: () => void;
  sortDirection?: 'asc' | 'desc' | null;
}

export interface TableCellProps {
  children: ReactNode;
  align?: 'left' | 'center' | 'right';
}

export const Table = ({ children }: TableProps) => {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>{children}</table>
    </div>
  );
};

export const TableHeader = ({ children }: TableHeaderProps) => {
  return <thead className={styles.header}>{children}</thead>;
};

export const TableBody = ({ children }: TableBodyProps) => {
  return <tbody className={styles.body}>{children}</tbody>;
};

export const TableRow = ({ children, onClick }: TableRowProps) => {
  return (
    <tr className={styles.row} onClick={onClick}>
      {children}
    </tr>
  );
};

export const TableHead = ({ children, sortable, onSort, sortDirection }: TableHeadProps) => {
  const classes = [
    styles.head,
    sortable && styles['head--sortable'],
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <th className={classes} onClick={sortable ? onSort : undefined}>
      <div className={styles.headContent}>
        {children}
        {sortable && (
          <span className={styles.sortIcon}>
            {sortDirection === 'asc' ? '↑' : sortDirection === 'desc' ? '↓' : '↕'}
          </span>
        )}
      </div>
    </th>
  );
};

export const TableCell = ({ children, align = 'left' }: TableCellProps) => {
  const classes = [styles.cell, styles[`cell--${align}`]].filter(Boolean).join(' ');

  return <td className={classes}>{children}</td>;
};
