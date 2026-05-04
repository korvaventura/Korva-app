import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import HomeScreen from './screens/HomeScreen';
import CatalogoScreen from './screens/CatalogoScreen';
import PerfilScreen from './screens/PerfilScreen';
import RegistroManualScreen from './screens/RegistroManualScreen';

const Tab = createBottomTabNavigator();

export default function App() {
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
          name="Registrar"
          component={RegistroManualScreen}
          options={{ tabBarIcon: () => <Text>➕</Text> }}
        />
        <Tab.Screen
          name="Perfil"
          component={PerfilScreen}
          options={{ tabBarIcon: () => <Text>👤</Text> }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}