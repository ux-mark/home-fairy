import { createContext } from 'react'
import type { NavStackAPI } from '@/hooks/useNavStack'

const noopFindDepth: NavStackAPI['findDepth'] = () => null

export const NavStackContext = createContext<NavStackAPI>({
  findDepth: noopFindDepth,
})
