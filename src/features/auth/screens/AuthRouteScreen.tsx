import React from 'react';
import { Navigate, useLocation, useRoutePath } from '@/core/navigation';
import { AuthenticatedFlowScreen } from './AuthenticatedFlowScreen';
import { asRoutePath, canAccessRoute, homeForRole } from '@/lib/utils/workflowRouting';
import { useAuth } from '@/data/contexts/AuthContext';
import { readReturnPath } from '@/core/routing/returnPath';

export function AuthRouteScreen() {
  const path = asRoutePath(useRoutePath());
  const location = useLocation();
  const auth = useAuth();
  const mode = path === 'signup' ? 'signup' : 'login';
  const next = readReturnPath(location.search);
  // An explicit visit to Sign in must show authentication, even when a prior
  // session exists. AuthViewModel navigates after successful verification.
  if (mode === 'signup' && auth.status === 'authenticated' && auth.user) {
    const target = next && canAccessRoute(next, auth.user.role) ? next : homeForRole(auth.user.role);
    return <Navigate to={`/${target}`} replace />;
  }
  return <AuthenticatedFlowScreen mode={mode} next={next} />;
}
