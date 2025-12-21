/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_PROJECT_ID: string;
	readonly VITE_WORKSPACE_ID: string;
	readonly VITE_API_HOST: string;
	readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
