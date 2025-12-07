/**
 * TableSkeleton - Generic loading skeleton for tables
 * Following FRONTEND_WOW.md: Pure UI component, zero business logic
 */

import { motion } from 'framer-motion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table/Table';
import { Skeleton } from '@/components/ui/Skeleton/Skeleton';

export interface TableSkeletonProps {
  /**
   * Number of rows to display
   */
  rows?: number;

  /**
   * Number of columns to display
   */
  columns?: number;

  /**
   * Whether to show a checkbox column
   */
  showCheckbox?: boolean;

  /**
   * Whether to show an actions column
   */
  showActions?: boolean;
}

/**
 * TableSkeleton component for table loading states
 * Displays an animated skeleton matching table structure
 */
export function TableSkeleton({
  rows = 5,
  columns = 5,
  showCheckbox = true,
  showActions = true,
}: TableSkeletonProps) {
  // Calculate total columns including optional ones
  const checkboxCols = showCheckbox ? 1 : 0;
  const actionsCols = showActions ? 1 : 0;
  const totalColumns = checkboxCols + columns + actionsCols;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {showCheckbox && (
              <TableHead className="w-[50px]">
                <Skeleton className="h-4 w-4" />
              </TableHead>
            )}
            {Array.from({ length: columns }).map((_, i) => (
              <TableHead key={`header-${i}`}>
                <Skeleton className="h-4 w-20" />
              </TableHead>
            ))}
            {showActions && (
              <TableHead className="w-[80px]">
                <Skeleton className="h-4 w-16" />
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <motion.tr
              key={`skeleton-row-${rowIndex}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: rowIndex * 0.05 }}
              className="border-b"
            >
              {showCheckbox && (
                <TableCell>
                  <Skeleton className="h-4 w-4" />
                </TableCell>
              )}
              {Array.from({ length: columns }).map((_, colIndex) => (
                <TableCell key={`cell-${rowIndex}-${colIndex}`}>
                  <Skeleton className={`h-4 ${colIndex === 0 ? 'w-32' : 'w-24'}`} />
                </TableCell>
              ))}
              {showActions && (
                <TableCell>
                  <Skeleton className="h-8 w-8 rounded-md" />
                </TableCell>
              )}
            </motion.tr>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
