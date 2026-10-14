import { createBrowserRouter, Navigate } from 'react-router-dom'
import Layout from '@/layout/Layout'
import LandingPage from '@/pages/LandingPage'
import GeoScratchExercisePage from '@/pages/GeoScratchExercisePage'
import ExerciseBrowserPage from '@/pages/ExerciseBrowserPage'
import SettingsPage from '@/pages/SettingsPage'
import SandboxPage from '@/pages/SandboxPage'
import UserStudyLiPage from '@/pages/UserStudyLiPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Navigate to="/landing" replace />,
      },
      {
        path: 'landing',
        element: <LandingPage />,
      },
      {
        path: 'exercises',
        element: <ExerciseBrowserPage />,
      },
      {
        path: 'exercises/:unitId',
        element: <Navigate to="/exercises" replace />,
      },
      {
        path: 'exercise',
        element: <GeoScratchExercisePage />,
      },
      {
        path: 'exercise/:exerciseId',
        element: <GeoScratchExercisePage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
      {
        path: 'sandbox',
        element: <SandboxPage />,
      },
    ],
  },
  {
    path: '/userstudy-Li',
    element: <UserStudyLiPage />,
  },
  {
    path: '/study-results',
    element: <UserStudyLiPage researcherOnly />,
  },
])

export default router
