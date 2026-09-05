import { ProductProvider } from '../_framework/ProductDomainContext';
import { SForkFeatPageContent } from './SForkFeatPageContent';

export function SForkFeatPage() {
	return (
		<ProductProvider>
			<SForkFeatPageContent />
		</ProductProvider>
	);
}
