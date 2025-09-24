import { useEffect, useState } from 'react';
import { View, Text, Button, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function Home() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: any }) => setEmail(data.user?.email ?? null));
  }, []);

  const testInsert = async () => {
    const { error } = await supabase.from('customers').insert({
      name: 'Jane Customer',
      email: 'jane@example.com',
    });
    if (error) Alert.alert('Insert failed', error.message);
    else Alert.alert('Success', 'Inserted customer for ' + email);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 12 }}>
      <Text style={{ fontSize: 20 }}>Welcome {email}</Text>
      <Button title="Test Insert Customer" onPress={testInsert} />
      <Button title="Sign Out" onPress={signOut} />
    </View>
  );
}
