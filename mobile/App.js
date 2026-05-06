import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, Platform } from 'react-native';
import { useState, useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import HomeScreen from './screens/HomeScreen';
import CatalogoScreen from './screens/CatalogoScreen';
import PerfilScreen from './screens/PerfilScreen';
import RegistroManualScreen from './screens/RegistroManualScreen';
import AdminScreen from './screens/AdminScreen';
import LoginScreen from './screens/LoginScreen';
import RankingScreen from './screens/RankingScreen';

const Tab = createBottomTabNavigator();
const BACKEND_URL = 'https://korva-app-production.up.railway.app';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const registrarPushToken = async (userId) => {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Permiso de notificaciones denegado');
      return;
    }

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    console.log('Push token:', token);

    await fetch(`${BACKEND_URL}/usuarios/push-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, push_token: token }),
    });

  } catch (error) {
    console.error('Error registrando push token:', error);
  }
};

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUsuario(session?.user ?? null);
      setCargando(false);
      if (session?.user?.id) {
        registrarPushToken(session.user.id);
      }
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setUsuario(session?.user ?? null);
      if (session?.user?.id) {
        registrarPushToken(session.user.id);
      }
    });
  }, []);

  if (cargando) return null;

  if (!usuario) {
    return <LoginScreen onLogin={(user) => setUsuario(user)} />;
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#0D1B2A',
            borderTopColor: '#1E3A5F',
          },
          tabBarActiveTintColor: '#1E6FD9',
          tabBarInactiveTintColor: '#A8CFFF',
        }}
      >
        <Tab.Screen
          name="Mis Retos"
          component={HomeScreen}
          options={{ tabBarIcon: () => <Text>🏃</Text> }}
        />
        <Tab.Screen
          name="Catalogo"
          component={CatalogoScreen}
          options={{ tabBarIcon: () => <Text>🏅</Text> }}
        />
        <Tab.Screen
          name="Ranking"
          component={RankingScreen}
          options={{ tabBarIcon: () => <Text>🏆</Text> }}
        />
        <Tab.Screen
          name="Registrar"
          component={RegistroManualScreen}
          options={{ tabBarIcon: () => <Text>➕</Text> }}
        />
        <Tab.Screen
          name="Perfil"
          component={PerfilScreen}
          options={{ tabBarIcon: () => <Text>👤</Text> }}
        />
        <Tab.Screen
          name="Admin"
          component={AdminScreen}
          options={{ tabBarIcon: () => <Text>⚙️</Text> }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}