'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { UserBrief } from './types';

export const useDirectory = () =>
  useQuery({ queryKey: ['directory'], queryFn: () => api<UserBrief[]>('/users/directory'), staleTime: 300_000 });

export const useTeams = () =>
  useQuery({ queryKey: ['teams'], queryFn: () => api<any[]>('/teams'), staleTime: 300_000 });

export const useOrganizations = (enabled = true) =>
  useQuery({ queryKey: ['organizations'], queryFn: () => api<any[]>('/organizations'), staleTime: 300_000, enabled });

export const useAwsAccounts = (enabled = true) =>
  useQuery({ queryKey: ['aws-accounts'], queryFn: () => api<any[]>('/aws-accounts'), enabled });
