import { createContext } from 'react';

export const SessionContext = createContext<{ ready: boolean } | null>(null);
