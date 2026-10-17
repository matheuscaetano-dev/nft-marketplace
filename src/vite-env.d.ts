interface ImportMetaEnv {
  readonly VITE_ENABLE_MOCKS?: string
  readonly VITE_MOCK_SCENARIO?: string
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
