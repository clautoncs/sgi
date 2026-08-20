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
  simulatedRole: string;
  setSimulatedRole: (role: string) => void;
  isSimulating: boolean;
  canSimulate: boolean;
  allRoles: RoleData[];
  hasPermission: (page: string, level?: 'view' | 'edit' | 'manage') => boolean;
  estoqueProfile: string;
}

const RoleContext = createContext<RoleContextType>({
  activeRole: null,
  realRole: '',
  simulatedRole: '',
  setSimulatedRole: () => {},
  isSimulating: false,
  canSimulate: false,
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

  const [simulatedRole, setSimulatedRole] = useState('');
  const [allRoles, setAllRoles] = useState<RoleData[]>([]);
  const [loaded, setLoaded] = useState(false);

  const canSimulate = realRole === 'sysadmin' || realRole === 'admin';

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch('/api/permissoes');
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
    setLoaded(true);
  }, []);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  const activeRoleName = (canSimulate && simulatedRole) ? simulatedRole : realRole;
  const activeRole = allRoles.find(r => r.name === activeRoleName) || null;
  const isSimulating = canSimulate && !!simulatedRole && simulatedRole !== realRole;

  const hasPermission = useCallback((page: string, level: 'view' | 'edit' | 'manage' = 'view') => {
    // sysadmin e admin reais (sem simulação) têm acesso total
    if (!isSimulating && (realRole === 'sysadmin' || realRole === 'admin')) return true;
    if (!activeRole) return false;
    const perm = activeRole.permissions.find(p => p.page === page);
    if (!perm) return false;
    return perm[level];
  }, [activeRole, isSimulating, realRole]);

  const estoqueProfile = activeRole?.estoqueProfile || 'varejo';

  return (
    <RoleContext.Provider value={{
      activeRole,
      realRole,
      simulatedRole,
      setSimulatedRole,
      isSimulating,
      canSimulate,
      allRoles,
      hasPermission,
      estoqueProfile,
    }}>
      {children}
    </RoleContext.Provider>
  );
}
