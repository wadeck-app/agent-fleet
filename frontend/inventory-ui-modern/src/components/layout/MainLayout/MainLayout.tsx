/**
 * MainLayout - Layout component
 * Following FRONTEND_WOW.md: Handles structural positioning, manages responsive behavior
 */

import { ReactNode } from 'react';
import { motion } from 'framer-motion';

export interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="container mx-auto px-4 py-8 max-w-7xl"
      >
        {children}
      </motion.div>
    </div>
  );
}
