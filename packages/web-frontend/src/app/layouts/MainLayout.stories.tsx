import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { Button } from '@framework/components/primitives/Button';
import type { Meta, StoryObj } from '@storybook/react';

import { InfoPanelProvider, useInfoPanel } from '@app/contexts/InfoPanelContext';

import MainLayout from './MainLayout';

/**
 * MainLayout provides the main application structure with:
 * - Desktop: Sidebar navigation + content area + optional info panel
 * - Mobile: Top menu + collapsible navigation + content area
 * - Responsive breakpoint at 768px
 * - Info panel only visible on desktop
 */
const meta = {
	title: 'Layouts/MainLayout',
	component: MainLayout,
	parameters: {
		layout: 'fullscreen',
	},
	decorators: [
		Story => (
			<InfoPanelProvider>
				<MemoryRouter initialEntries={['/ingredients']}>
					<Routes>
						<Route path="*" element={<Story />} />
					</Routes>
				</MemoryRouter>
			</InfoPanelProvider>
		),
	],
} satisfies Meta<typeof MainLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default desktop layout with sidebar navigation and content area.
 * Resize viewport to see mobile layout at <768px.
 */
export const Desktop: Story = {
	render: () => {
		const PageContent = () => (
			<div className="rounded-lg bg-white p-6">
				<h2 className="mb-4 text-2xl font-bold">Ingrédients Page</h2>
				<p className="text-muted-foreground">
					This is the main content area. In the real application, this would be rendered via {'<Outlet />'}{' '}
					from React Router.
				</p>
				<p className="mt-4 text-sm text-muted-foreground">
					Desktop layout shows: Sidebar (250px) + Content (flex) + Info Panel (if active)
				</p>
			</div>
		);

		return (
			<Routes>
				<Route path="*" element={<MainLayout />}>
					<Route index element={<PageContent />} />
				</Route>
			</Routes>
		);
	},
};

/**
 * Desktop layout with info panel visible.
 * Click "Show Info Panel" to display the side panel.
 */
export const DesktopWithInfoPanel: Story = {
	render: () => {
		function PageWithInfoPanel() {
			const [showPanel, setShowPanel] = useState(false);
			const { setInfoPanelContent } = useInfoPanel();

			const handleShowPanel = () => {
				setShowPanel(true);
				setInfoPanelContent(
					<div className="space-y-4">
						<div>
							<h3 className="mb-2 text-lg font-semibold">Info Panel</h3>
							<p className="text-sm">
								This panel appears on the right side of the screen on desktop only.
							</p>
						</div>
						<div className="space-y-2">
							<p className="text-sm font-semibold">Quick Facts:</p>
							<ul className="list-inside list-disc space-y-1 text-sm">
								<li>Width: 300px</li>
								<li>Desktop only</li>
								<li>Scrollable content</li>
								<li>Resets on route change</li>
							</ul>
						</div>
						<Button
							onClick={() => {
								setShowPanel(false);
								setInfoPanelContent(null);
							}}
							size="sm"
							variant="secondary"
						>
							Close Panel
						</Button>
					</div>
				);
			};

			const handleHidePanel = () => {
				setShowPanel(false);
				setInfoPanelContent(null);
			};

			return (
				<div className="rounded-lg bg-white p-6">
					<h2 className="mb-4 text-2xl font-bold">Ingrédients Page</h2>
					<p className="mb-4 text-muted-foreground">
						The info panel can be used to show contextual information, help text, or additional details.
					</p>
					<div className="flex gap-2">
						{!showPanel ? (
							<Button onClick={handleShowPanel}>Show Info Panel</Button>
						) : (
							<Button onClick={handleHidePanel} variant="secondary">
								Hide Info Panel
							</Button>
						)}
					</div>
				</div>
			);
		}

		return (
			<Routes>
				<Route path="*" element={<MainLayout />}>
					<Route index element={<PageWithInfoPanel />} />
				</Route>
			</Routes>
		);
	},
};

/**
 * Mobile layout with top menu and collapsible navigation.
 * Set viewport to <768px to see mobile layout, or use Chrome DevTools mobile emulation.
 */
export const Mobile: Story = {
	parameters: {
		viewport: {
			defaultViewport: 'mobile1',
		},
	},
	render: () => {
		const MobileContent = () => (
			<div className="rounded-lg bg-white p-4">
				<h2 className="mb-3 text-xl font-bold">Ingrédients Page</h2>
				<p className="text-sm text-muted-foreground">
					On mobile, the navigation is hidden behind a menu button (☰) in the top bar.
				</p>
				<p className="mt-3 text-sm text-muted-foreground">
					Mobile layout shows: Top Menu (60px) + Collapsible Nav + Content
				</p>
			</div>
		);

		return (
			<Routes>
				<Route path="*" element={<MainLayout />}>
					<Route index element={<MobileContent />} />
				</Route>
			</Routes>
		);
	},
};

/**
 * Mobile layout with navigation menu open.
 * Shows how the mobile menu appears when user taps the menu button.
 */
export const MobileWithMenuOpen: Story = {
	parameters: {
		viewport: {
			defaultViewport: 'mobile1',
		},
	},
	render: () => {
		const MobileMenuContent = () => (
			<div className="rounded-lg bg-white p-4">
				<h2 className="mb-3 text-xl font-bold">Mobile Menu Example</h2>
				<p className="text-sm text-muted-foreground">
					Click the menu button (☰) in the top bar to toggle the navigation menu.
				</p>
				<p className="mt-3 text-sm text-muted-foreground">
					The mobile menu slides in below the top bar with all navigation links.
				</p>
			</div>
		);

		return (
			<Routes>
				<Route path="*" element={<MainLayout />}>
					<Route index element={<MobileMenuContent />} />
				</Route>
			</Routes>
		);
	},
};

/**
 * Desktop layout with all navigation routes visible.
 * Shows how different routes highlight the active navigation link.
 */
export const WithMultipleRoutes: Story = {
	render: () => {
		const RecipesContent = () => (
			<div className="rounded-lg bg-white p-6">
				<h2 className="mb-4 text-2xl font-bold">Recettes Page</h2>
				<p className="text-muted-foreground">Notice how "Recettes" is highlighted in the sidebar navigation.</p>
			</div>
		);

		return (
			<MemoryRouter initialEntries={['/recipes']}>
				<InfoPanelProvider>
					<Routes>
						<Route path="/recipes" element={<MainLayout />}>
							<Route index element={<RecipesContent />} />
						</Route>
					</Routes>
				</InfoPanelProvider>
			</MemoryRouter>
		);
	},
};
