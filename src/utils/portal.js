import { inject } from 'vue'
export const portalKey = Symbol('creator-portal')
export const usePortal = () => inject(portalKey)
