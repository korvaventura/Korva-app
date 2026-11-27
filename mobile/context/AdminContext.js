import { createContext, useContext } from 'react';

// App supplies its existing admin decision. Default closed for isolated maps.
export const AdminContext = createContext(false);
export const useEsAdmin = () => useContext(AdminContext) === true;
