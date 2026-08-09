"use client";

import { useAuthenticationStatus } from '@nhost/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.push('/dashboard');
      } else {
        router.push('/login');
      }
    }
  }, [isLoading, isAuthenticated, router]);

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold text-blue-600 mb-4">AI Agent Workflow Builder</h1>
        <p className="text-gray-500 text-lg">Redirecting...</p>
      </div>
    </div>
  );
}
