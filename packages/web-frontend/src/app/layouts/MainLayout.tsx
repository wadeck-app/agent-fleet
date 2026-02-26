import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { DynamicLucideIcon } from '@framework/components/icons/DynamicLucideIcon';
import { Button } from '@framework/components/primitives/Button';
import { useDocumentTitle } from '@framework/hooks/useDocumentTitle';
import { useMediaQuery } from '@framework/hooks/useMediaQuery';
import { Menu, X } from 'lucide-react';

import { useInfoPanel } from '@app/contexts/InfoPanelContext';
import { WorkspaceIndicator } from '@app/features/workspace/WorkspaceIndicator';

export default function MainLayout() {
	const isMobile = useMediaQuery('(max-width: 768px)');
	const location = useLocation();
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const { infoPanelContent, setInfoPanelContent } = useInfoPanel();

	// Reset info panel content when route changes
	useEffect(() => {
		setInfoPanelContent(null);
	}, [location.pathname, setInfoPanelContent]);

	const navItems = [
		{ path: '/ingredients', label: 'Ingrédients', icon: 'Salad' },
		{ path: '/recipes', label: 'Recettes', icon: 'Book' },
		{ path: '/tracking', label: 'Suivi Quotidien', icon: 'BarChart3' },
		{ path: '/chat', label: 'Chat IA', icon: 'MessageCircle' },
	];

	const isActive = (path: string) => location.pathname === path;

	// Get current page title based on location
	const getCurrentPageTitle = () => {
		const currentItem = navItems.find(item => item.path === location.pathname);
		return currentItem ? currentItem.label : 'Assistant';
	};

	// Update document title with workspace prefix
	useDocumentTitle(getCurrentPageTitle());

	return (
		<div className="flex min-h-screen w-full flex-1">
			{isMobile ? (
				<div className="flex w-full flex-col">
					{/* Mobile layout */}
					<header
						className={`
        flex h-[60px] items-center justify-between bg-[#2c3e50] px-4 text-white
      `}
					>
						<div className="flex items-center gap-3">
							<h1 className="m-0 text-xl">{getCurrentPageTitle()}</h1>
							<WorkspaceIndicator />
						</div>
						<Button
							variant="ghost"
							aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
							onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
							className="text-white"
						>
							{mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
						</Button>
					</header>

					{mobileMenuOpen && (
						<nav className="flex flex-col gap-2 bg-[#34495e] p-4">
							{navItems.map(item => (
								<Link
									key={item.path}
									to={item.path}
									className={`
           flex items-center gap-3 rounded px-3 py-3 text-white no-underline
           transition-colors
           hover:bg-white/10
           ${isActive(item.path) ? 'bg-[#3498db]' : ''}
         `}
									onClick={() => setMobileMenuOpen(false)}
								>
									<DynamicLucideIcon name={item.icon} className="h-5 w-5" />
									<span>{item.label}</span>
								</Link>
							))}
						</nav>
					)}

					<main className="bg-[#ecf0f1] p-4">
						<Outlet />
					</main>
				</div>
			) : (
				<>
					{/* Desktop layout */}
					<aside className="flex w-[250px] flex-col bg-[#2c3e50] p-4 text-white">
						<div className="mb-8 flex flex-col gap-3">
							<h1 className="m-0 text-2xl font-semibold">Assistant</h1>
							<WorkspaceIndicator />
						</div>
						<nav className="flex flex-col gap-2">
							{navItems.map(item => (
								<Link
									key={item.path}
									to={item.path}
									className={`
           flex items-center gap-3 rounded px-3 py-3 text-white no-underline
           transition-colors
           hover:bg-white/10
           ${isActive(item.path) ? 'bg-[#3498db]' : ''}
         `}
								>
									<DynamicLucideIcon name={item.icon} className="h-5 w-5" />
									<span>{item.label}</span>
								</Link>
							))}
						</nav>
					</aside>
					<main className={`flex min-h-0 flex-1 flex-col overflow-hidden bg-[#ecf0f1] p-8`}>
						<Outlet />
					</main>
					{infoPanelContent && (
						<aside
							className={`
         w-[300px] overflow-y-auto overscroll-y-contain bg-[#34495e] p-4
         text-white
         [-webkit-overflow-scrolling:touch]
       `}
						>
							{infoPanelContent}
						</aside>
					)}
				</>
			)}
		</div>
	);
}
