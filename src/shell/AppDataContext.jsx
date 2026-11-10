import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { App as AntApp } from 'antd'
import { api } from '../api'
import { docApi } from '../subsystems/docs/api'

const AppDataContext = createContext({
  types: [],
  typesLoading: true,
  reloadTypes: () => {},
  docTypes: [],
  docTypesLoading: true,
  reloadDocTypes: () => {},
})

export function useAppData() {
  return useContext(AppDataContext)
}

export function AppDataProvider({ children }) {
  const { message } = AntApp.useApp()
  const [types, setTypes] = useState([])
  const [typesLoading, setTypesLoading] = useState(true)
  const [docTypes, setDocTypes] = useState([])
  const [docTypesLoading, setDocTypesLoading] = useState(true)

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

  const reloadDocTypes = useCallback(async () => {
    try {
      const data = await docApi.listTypes()
      setDocTypes(data.types)
      return data.types
    } catch (error) {
      message.error(error.message)
      return []
    } finally {
      setDocTypesLoading(false)
    }
  }, [message])

  useEffect(() => {
    reloadTypes()
    reloadDocTypes()
  }, [reloadTypes, reloadDocTypes])

  const value = useMemo(
    () => ({
      types,
      typesLoading,
      reloadTypes,
      docTypes,
      docTypesLoading,
      reloadDocTypes,
    }),
    [types, typesLoading, reloadTypes, docTypes, docTypesLoading, reloadDocTypes],
  )

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}
