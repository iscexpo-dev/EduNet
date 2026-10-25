'use client';

import { useState } from 'react';
import { useAuth } from '@edunet/auth';
import { Button, Input, Card, CardHeader, CardContent, CardFooter } from '@edunet/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-2xl font-bold text-center">Login to EduNet</h1>
          <p className="text-gray-600 text-center">Enter your credentials to access your account</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
            {error && <div className="text-red-600 text-sm">{error}</div>}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              isLoading={isLoading}
            >
              Login
            </Button>
          </form>
        </CardContent>
        <CardFooter className="text-center">
          <p className="text-gray-600">
            Don&apos;t have an account?{' '}
            <a href="/register" className="text-blue-600 hover:underline">
              Register
            </a>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
