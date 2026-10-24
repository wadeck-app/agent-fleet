export interface Shutdownable {
	shutdown(): void | Promise<void>;
}
