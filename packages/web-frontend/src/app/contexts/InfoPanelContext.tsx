import { ReactNode, createContext, useContext, useState } from 'react';

interface InfoPanelContextType {
	infoPanelContent: ReactNode | null;
	setInfoPanelContent: (content: ReactNode | null) => void;
}

const InfoPanelContext = createContext<InfoPanelContextType | undefined>(undefined);

export function InfoPanelProvider({ children }: { children: ReactNode }) {
	const [infoPanelContent, setInfoPanelContent] = useState<ReactNode | null>(null);

	return (
		<InfoPanelContext.Provider value={{ infoPanelContent, setInfoPanelContent }}>
			{children}
		</InfoPanelContext.Provider>
	);
}

export function useInfoPanel() {
	const context = useContext(InfoPanelContext);
	if (!context) {
		throw new Error('useInfoPanel must be used within InfoPanelProvider');
	}
	return context;
}
