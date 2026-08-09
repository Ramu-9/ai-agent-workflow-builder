"use client";

import { useAuthenticationStatus, useSignOut } from '@nhost/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { OrgSwitcher } from '../../components/OrgSwitcher';
import Link from 'next/link';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const { signOut } = useSignOut();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <Link href="/dashboard" className="text-xl font-bold text-blue-600">
                  AI Agent Workflow Builder
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-6">
              <OrgSwitcher />
              <button
                onClick={() => {
                  signOut();
                  router.push('/login');
                }}
                className="text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
