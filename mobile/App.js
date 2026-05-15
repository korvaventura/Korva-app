import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import { useState, useEffect } from 'react';
import * as Linking from 'expo-linking';
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
import TerminosScreen from './screens/TerminosScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import DetalleRetoScreen from './screens/DetalleRetoScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const ADMINS = [
  'korvaventura@gmail.com',
  'fabrialejandrogonzalez@gmail.com',
  'malejo.eche16@gmail.com',
];

const chequearPantallas = async (setMostrarTerminos, setMostrarOnboarding) => {
  const terminosAceptados = await AsyncStorage.getItem('terminos_aceptados');
  if (!terminosAceptados) {
    setMostrarTerminos(true);
  } else {
    const onboardingVisto = await AsyncStorage.getItem('onboarding_visto');
    if (!onboardingVisto) setMostrarOnboarding(true);
  }
};

function HomeTabs({ esAdmin }) {
  return (
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
      <Tab.Screen name="Mis Retos" component={HomeScreen} options={{ tabBarIcon: () => <Text>🏃</Text> }} />
      <Tab.Screen name="Catalogo" component={CatalogoScreen} options={{ tabBarIcon: () => <Text>🏅</Text> }} />
      <Tab.Screen name="Ranking" component={RankingScreen} options={{ tabBarIcon: () => <Text>🏆</Text> }} />
     <Tab.Screen name="Registrar" component={RegistroManualScreen} options={{ tabBarLabel: 'Registrar km', tabBarIcon: () => <Text>➕</Text> }} />
      <Tab.Screen name="Perfil" component={PerfilScreen} options={{ tabBarIcon: () => <Text>👤</Text> }} />
      {esAdmin && (
        <Tab.Screen name="Admin" component={AdminScreen} options={{ tabBarIcon: () => <Text>⚙️</Text> }} />
      )}
    </Tab.Navigator>
  );
}

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarTerminos, setMostrarTerminos] = useState(false);
  const [mostrarOnboarding, setMostrarOnboarding] = useState(false);
  const [mostrarReset, setMostrarReset] = useState(false);

  useEffect(() => {
    const handleDeepLink = async (url) => {
      if (!url) return;
      if (url.includes('reset-password') || url.includes('type=recovery')) {
        setMostrarReset(true);
      }
    };

    Linking.getInitialURL().then(handleDeepLink);
    const subscription = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUsuario(session?.user ?? null);
      setCargando(false);
      if (session?.user) {
        await chequearPantallas(setMostrarTerminos, setMostrarOnboarding);
      }
    });

    supabase.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user ?? null;
      setUsuario(user);
      if (event === 'PASSWORD_RECOVERY') {
        setMostrarReset(true);
      } else if (user) {
        await chequearPantallas(setMostrarTerminos, setMostrarOnboarding);
      }
    });

    return () => subscription.remove();
  }, []);

  const aceptarTerminos = async () => {
    await AsyncStorage.setItem('terminos_aceptados', 'true');
    setMostrarTerminos(false);
    const onboardingVisto = await AsyncStorage.getItem('onboarding_visto');
    if (!onboardingVisto) setMostrarOnboarding(true);
  };

  const terminarOnboarding = async () => {
    await AsyncStorage.setItem('onboarding_visto', 'true');
    setMostrarOnboarding(false);
  };

  if (cargando) return null;

  if (mostrarReset) {
    return <ResetPasswordScreen onVolver={() => { setMostrarReset(false); setUsuario(null); }} />;
  }

  if (!usuario) {
    return <LoginScreen onLogin={(user) => setUsuario(user)} />;
  }

  if (mostrarTerminos) {
    return <TerminosScreen onAceptar={aceptarTerminos} />;
  }

  if (mostrarOnboarding) {
    return <OnboardingScreen onTerminar={terminarOnboarding} />;
  }

  const esAdmin = ADMINS.includes(usuario.email?.toLowerCase());

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="HomeTabs">
          {() => <HomeTabs esAdmin={esAdmin} />}
        </Stack.Screen>
        <Stack.Screen name="DetalleReto" component={DetalleRetoScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}