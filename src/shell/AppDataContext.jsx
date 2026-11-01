import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { App as AntApp } from 'antd'
import { api } from '../api'

const AppDataContext = createContext({
  types: [],
  typesLoading: true,
  reloadTypes: () => {},
})

export function useAppData() {
  return useContext(AppDataContext)
}

export function AppDataProvider({ children }) {
  const { message } = AntApp.useApp()
  const [types, setTypes] = useState([])
  const [typesLoading, setTypesLoading] = useState(true)

  const reloadTypes = useCallback(async () => {
    try {
      const data = await api.listTypes()
      setTypes(data.types)
      return data.types
    } catch (error) {
      message.error(error.message)
      return []
    } finally {
      setTypesLoading(false)
    }
  }, [message])

  useEffect(() => {
    reloadTypes()
  }, [reloadTypes])

  const value = useMemo(
    () => ({ types, typesLoading, reloadTypes }),
    [types, typesLoading, reloadTypes],
  )

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}
