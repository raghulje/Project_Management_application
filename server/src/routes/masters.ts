import { Router } from 'express'
import { makeCrudRouter } from '../utils/crud.js'

export const mastersRouter = Router()

mastersRouter.use('/companies', makeCrudRouter({
  table: 'companies',
  resource: 'company',
  searchable: ['name', 'code'],
  allowedFields: ['name', 'code', 'notes'],
}))

mastersRouter.use('/legal-entities', makeCrudRouter({
  table: 'legal_entities',
  resource: 'legal_entity',
  searchable: ['code', 'name'],
  allowedFields: ['company_id', 'code', 'name', 'notes'],
}))

mastersRouter.use('/locations', makeCrudRouter({
  table: 'locations',
  resource: 'location',
  searchable: ['name', 'address'],
  allowedFields: ['name', 'parent_id', 'company_id', 'address', 'notes'],
}))

mastersRouter.use('/departments', makeCrudRouter({
  table: 'departments',
  resource: 'department',
  searchable: ['name'],
  allowedFields: ['name', 'company_id', 'location_id', 'notes'],
}))
