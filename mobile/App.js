import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import HomeScreen from './screens/HomeScreen';
import CatalogoScreen from './screens/CatalogoScreen';
import PerfilScreen from './screens/PerfilScreen';
import RegistroManualScreen from './screens/RegistroManualScreen';
import AdminScreen from './screens/AdminScreen';
import LoginScreen from './screens/LoginScreen';
import RankingScreen from './screens/RankingScreen';
import OnboardingScreen from './screens/OnboardingScreen';

const Tab = createBottomTabNavigator();

const ADMINS = [
  'korvaventura@gmail.com',
  'fabrialejandrogonzalez@gmail.com',
  'malejo.eche16@gmail.com',
];

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarOnboarding, setMostrarOnboarding] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUsuario(session?.user ?? null);
      setCargando(false);
    });

    supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user ?? null;
      setUsuario(user);
      if (user) {
        const visto = await AsyncStorage.getItem('onboarding_visto');
        if (!visto) setMostrarOnboarding(true);
      }
    });
  }, []);

  const terminarOnboarding = async () => {
    await AsyncStorage.setItem('onboarding_visto', 'true');
    setMostrarOnboarding(false);
  };

  if (cargando) return null;

  if (!usuario) {
    return <LoginScreen onLogin={(user) => setUsuario(user)} />;
  }

  if (mostrarOnboarding) {
    return <OnboardingScreen onTerminar={terminarOnboarding} />;
  }

  const esAdmin = ADMINS.includes(usuario.email?.toLowerCase());

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
        {esAdmin && (
          <Tab.Screen
            name="Admin"
            component={AdminScreen}
            options={{ tabBarIcon: () => <Text>⚙️</Text> }}
          />
        )}
      </Tab.Navigator>
    </NavigationContainer>
  );
}