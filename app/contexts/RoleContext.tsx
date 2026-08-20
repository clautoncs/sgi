'use client';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useSession } from 'next-auth/react';

interface Permission {
  page: string;
  view: boolean;
  edit: boolean;
  manage: boolean;
}

interface RoleData {
  id: string;
  name: string;
  label: string;
  estoqueProfile: string;
  permissions: Permission[];
}

interface RoleContextType {
  activeRole: RoleData | null;
  realRole: string;
  allRoles: RoleData[];
  hasPermission: (page: string, level?: 'view' | 'edit' | 'manage') => boolean;
  estoqueProfile: string;
}

const RoleContext = createContext<RoleContextType>({
  activeRole: null,
  realRole: '',
  allRoles: [],
  hasPermission: () => false,
  estoqueProfile: 'varejo',
});

export function useRole() {
  return useContext(RoleContext);
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const user = session?.user as any;
  const realRole = user?.role || '';

  const [allRoles, setAllRoles] = useState<RoleData[]>([]);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch('\/api\/permissoes');
      const data = await res.json();
      if (data.roles) {
        setAllRoles(data.roles.map((r: any) => ({
          id: r.id,
          name: r.name,
          label: r.label,
          estoqueProfile: r.estoqueProfile || 'varejo',
          permissions: r.permissions || [],
        })));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  const activeRole = allRoles.find(r => r.name === realRole) || null;

  const hasPermission = useCallback((page: string, level: 'view' | 'edit' | 'manage' = 'view') => {
    if (realRole === 'sysadmin' || realRole === 'admin') return true;
    if (!activeRole) return false;
    const perm = activeRole.permissions.find(p => p.page === page);
    if (!perm) return false;
    return perm[level];
  }, [activeRole, realRole]);

  const estoqueProfile = activeRole?.estoqueProfile || 'varejo';

  return (
    <RoleContext.Provider value={{
      activeRole,
      realRole,
      allRoles,
      hasPermission,
      estoqueProfile,
    }}>
      {children}
    </RoleContext.Provider>
  );
}
