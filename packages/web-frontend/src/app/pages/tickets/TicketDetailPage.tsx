import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ErrorAlert } from '@framework/components/feedback/ErrorAlert';
import { Page } from '@framework/components/layout/Page';
import { LoadingSpinner } from '@framework/components/loading/LoadingSpinner';
import { Button } from '@framework/components/primitives/Button';
import type { Ticket } from '@shared/api/tickets.contract';
import { ArrowLeft } from 'lucide-react';

import type { LayoutKey } from './LayoutSwitcher';
import { LayoutSwitcher, getStoredLayout } from './LayoutSwitcher';
import { TicketDetailLayoutA } from './TicketDetailLayoutA';
import { TicketDetailLayoutB } from './TicketDetailLayoutB';
import { TicketDetailLayoutC } from './TicketDetailLayoutC';
import { TicketDetailLayoutD } from './TicketDetailLayoutD';
import { TicketDetailLayoutE } from './TicketDetailLayoutE';
import { TicketDetailLayoutF } from './TicketDetailLayoutF';
import { TicketDetailLayoutG } from './TicketDetailLayoutG';
import { ticketsApi } from './tickets.api';
import { useTicket } from './useTicket';

/**
 * ===========================================================================================
 * TICKET DETAIL PAGE
 * ===========================================================================================
 *
 * Ticket detail page with multiple layout options.
 * Layouts: A (Jira), B (GitHub), C (YouTrack), D (Linear), E (GitLab), F (AI Mode), G (Hybrid)
 *
 * ===========================================================================================
 */
export function TicketDetailPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { ticket, loading, error, refresh } = useTicket(id);
	const [layout, setLayout] = useState<LayoutKey>(getStoredLayout());

	// Update ticket helper
	const handleUpdate = useCallback(
		async (updates: Partial<Ticket>) => {
			if (!ticket || !id) {
				return;
			}
			await ticketsApi.updateTicket(id, {
				...updates,
				version: ticket.version,
			});
			await refresh();
		},
		[ticket, id, refresh]
	);

	const renderLayout = () => {
		if (!ticket || !id) return null;

		switch (layout) {
			case 'a':
				return (
					<TicketDetailLayoutA ticket={ticket} ticketId={id} onUpdate={handleUpdate} onRefresh={refresh} />
				);
			case 'b':
				return (
					<TicketDetailLayoutB ticket={ticket} ticketId={id} onUpdate={handleUpdate} onRefresh={refresh} />
				);
			case 'c':
				return (
					<TicketDetailLayoutC ticket={ticket} ticketId={id} onUpdate={handleUpdate} onRefresh={refresh} />
				);
			case 'd':
				return <TicketDetailLayoutD ticket={ticket} ticketId={id} onRefresh={refresh} />;
			case 'e':
				return (
					<TicketDetailLayoutE ticket={ticket} ticketId={id} onUpdate={handleUpdate} onRefresh={refresh} />
				);
			case 'f':
				return (
					<TicketDetailLayoutF ticket={ticket} ticketId={id} onUpdate={handleUpdate} onRefresh={refresh} />
				);
			case 'g':
				return (
					<TicketDetailLayoutG ticket={ticket} ticketId={id} onUpdate={handleUpdate} onRefresh={refresh} />
				);
			default:
				throw new Error(`Unknown layout: ${layout}`);
		}
	};

	if (loading) {
		return (
			<Page>
				<div className="flex h-96 items-center justify-center">
					<LoadingSpinner />
				</div>
			</Page>
		);
	}

	if (error || !ticket) {
		return (
			<Page>
				<ErrorAlert message={error?.message || 'Ticket not found'} onDismiss={() => navigate('/tickets')} />
			</Page>
		);
	}

	return (
		<Page>
			{/* Layout switcher always visible */}
			<div className="mb-4 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						onClick={() => navigate('/tickets')}
						className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
					>
						<ArrowLeft size={16} /> Tickets
					</Button>
					{id && (
						<>
							<span className="text-sm text-muted-foreground">/</span>
							<span className="font-mono text-xs text-muted-foreground">{id}</span>
						</>
					)}
				</div>
				<LayoutSwitcher current={layout} onChange={setLayout} />
			</div>

			{renderLayout()}
		</Page>
	);
}
