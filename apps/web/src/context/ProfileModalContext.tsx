import { createContext, useContext } from 'react'

/** Lets any page open the global access-profile dialog. */
export const ProfileModalContext = createContext<{ openProfileModal: () => void }>({
  openProfileModal: () => {}
})

export const useProfileModal = () => useContext(ProfileModalContext)
