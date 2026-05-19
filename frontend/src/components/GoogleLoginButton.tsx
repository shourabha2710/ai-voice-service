import { GoogleLogin } from '@react-oauth/google';
import { toast } from 'react-hot-toast';
import { useState } from 'react';
import { useAuth } from '../store/AuthContext';

export default function GoogleLoginButton() {
  const { login } = useAuth();

  return (
    <div className="w-full flex justify-center py-2">
      <GoogleLogin
        onSuccess={async (credentialResponse) => {
          if (credentialResponse.credential) {
            try {
              const res = await fetch('/api/v1/auth/google', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token: credentialResponse.credential }),
              });
              
              if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Google login failed');
              }
              
              const data = await res.json();
              await login(data.access_token, data.refresh_token);
            } catch (err: any) {
              toast.error(err.message || 'Login failed');
            }
          }
        }}
        onError={() => {
          toast.error('Google Login Failed');
        }}
        useOneTap
        shape="rectangular"
        theme="filled_blue"
        size="large"
        width="100%"
        text="continue_with"
      />
    </div>
  );
}
