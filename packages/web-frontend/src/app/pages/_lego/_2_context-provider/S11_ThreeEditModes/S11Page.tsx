import { ProductProvider } from '../_framework/ProductDomainContext';
import { S11Content } from './S11Content';

/**
 * ===========================================================================================
 * S11: THREE EDIT MODES
 * ===========================================================================================
 */

export function S11Page() {
	return (
		<ProductProvider>
			<S11Content />
		</ProductProvider>
	);
}
