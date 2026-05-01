import { RouterProvider } from 'react-router'
import { router } from '@/app/router'
import { useApplyUIPrefs } from '@/app/use-apply-ui-prefs'

export function App() {
  useApplyUIPrefs()
  return <RouterProvider router={router} />
}
