import { useEffect, useState } from 'react';
import { Alert, View, TextInput, Button, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function Login() {
  const router = useRouter();  // ✅ useRouter hook
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    // Check if already signed in
    supabase.auth.getSession().then(({ data }: { data: any }) => {
      if (data.session) router.replace('/(tabs)/home');
    });

    // Subscribe to auth state changes
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_e: string, session: any) => {
        if (session) router.replace('/(tabs)/home');
      }
    );

    return () => sub.subscription.unsubscribe();
  }, []);

const signIn = async () => {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    alert(error.message);
  }
};

const signUp = async () => {
  const { error } = await supabase.auth.signUp({
    email,
    password,
  });
  if (error) {
    alert(error.message);
  } else {
    alert('Check your email for a confirmation link!');
  }
};

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '600', marginBottom: 12 }}>QuickQuote</Text>
      <TextInput
        placeholder="Email"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
        style={{ borderWidth: 1, padding: 12, borderRadius: 8 }}
      />
      <TextInput
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={{ borderWidth: 1, padding: 12, borderRadius: 8 }}
      />
      <Button title="Sign In" onPress={signIn} />
      <Button title="Create Account" onPress={signUp} />
    </View>
  );
}
