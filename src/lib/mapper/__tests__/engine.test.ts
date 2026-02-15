import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseJSON } from '../parsers'
import {
    applyMappings,
    generateJSONOutput,
    treeToData,
} from '../engine'
import type { Mapping } from '../types'

const samplesDir = resolve(__dirname, '../../../../BasicMapperTestingSamples')

function loadSample(name: string): string {
    return readFileSync(resolve(samplesDir, name), 'utf-8')
}

describe('treeToData', () => {
    it('round-trips a flat object (sample1)', () => {
        const raw = JSON.parse(loadSample('sampleInput1.json'))
        const tree = parseJSON(loadSample('sampleInput1.json'))
        const result = treeToData(tree)
        expect(result).toEqual(raw)
    })

    it('round-trips a nested object (sample2)', () => {
        const raw = JSON.parse(loadSample('sampleInput2.json'))
        const tree = parseJSON(loadSample('sampleInput2.json'))
        const result = treeToData(tree)
        expect(result).toEqual(raw)
    })

    it('does not double-nest arrays (sample3)', () => {
        const raw = JSON.parse(loadSample('sampleInput3.json'))
        const tree = parseJSON(loadSample('sampleInput3.json'))
        const result = treeToData(tree) as Record<string, unknown>

        // products should be a flat array of objects, not [[{...}]]
        expect(Array.isArray(result.products)).toBe(true)
        expect(result.products).toHaveLength(2)
        expect(Array.isArray((result.products as Array<unknown>)[0])).toBe(false)
        expect(result).toEqual(raw)
    })

    it('round-trips nested objects (sample4)', () => {
        const raw = JSON.parse(loadSample('sampleInput4.json'))
        const tree = parseJSON(loadSample('sampleInput4.json'))
        expect(treeToData(tree)).toEqual(raw)
    })

    it('round-trips deeply nested objects (sample5)', () => {
        const raw = JSON.parse(loadSample('sampleInput5.json'))
        const tree = parseJSON(loadSample('sampleInput5.json'))
        expect(treeToData(tree)).toEqual(raw)
    })

    it('round-trips objects with arrays (sample6)', () => {
        const raw = JSON.parse(loadSample('sampleInput6.json'))
        const tree = parseJSON(loadSample('sampleInput6.json'))
        expect(treeToData(tree)).toEqual(raw)
    })

    it('preserves number types', () => {
        const tree = parseJSON(loadSample('sampleInput3.json'))
        const result = treeToData(tree) as Record<string, unknown>
        const products = result.products as Array<Record<string, unknown>>
        expect(typeof products[0].id).toBe('number')
        expect(typeof products[0].price).toBe('number')
        expect(products[0].id).toBe(1)
        expect(products[0].price).toBe(900)
    })

    it('preserves string types', () => {
        const tree = parseJSON(loadSample('sampleInput3.json'))
        const result = treeToData(tree) as Record<string, unknown>
        const products = result.products as Array<Record<string, unknown>>
        expect(typeof products[0].name).toBe('string')
        expect(products[0].name).toBe('Laptop')
    })

    it('returns null for null tree', () => {
        expect(treeToData(null)).toBeNull()
    })

    it('round-trips root-level array (sampleOutput6)', () => {
        const raw = JSON.parse(loadSample('sampleOutput6.json'))
        const tree = parseJSON(loadSample('sampleOutput6.json'))
        expect(treeToData(tree)).toEqual(raw)
    })
})

describe('applyMappings', () => {
    it('maps source values to target template', () => {
        const sourceData = JSON.parse(loadSample('sampleInput1.json'))
        const targetTree = parseJSON(loadSample('sampleOutput1.json'))
        const targetTemplate = treeToData(targetTree) as Record<string, unknown>

        const mappings: Array<Mapping> = [
            { id: 'm1', sourceId: 'root.id', targetId: 'root.userId' },
            { id: 'm2', sourceId: 'root.first_name', targetId: 'root.fullName' },
            { id: 'm3', sourceId: 'root.age', targetId: 'root.ageInYears' },
        ]

        const { result, errors } = applyMappings(sourceData, mappings, targetTemplate)
        expect(errors).toHaveLength(0)

        const r = result as Record<string, unknown>
        expect(r.userId).toBe('101')
        expect(r.fullName).toBe('John')
        expect(r.ageInYears).toBe('28')
    })

    it('maps nested source to flat target', () => {
        const sourceData = JSON.parse(loadSample('sampleInput2.json'))
        const targetTree = parseJSON(loadSample('sampleOutput2.json'))
        const targetTemplate = treeToData(targetTree) as Record<string, unknown>

        const mappings: Array<Mapping> = [
            { id: 'm1', sourceId: 'root.order_id', targetId: 'root.order.id' },
            { id: 'm2', sourceId: 'root.total', targetId: 'root.order.amount.value' },
            { id: 'm3', sourceId: 'root.currency', targetId: 'root.order.amount.currency' },
            { id: 'm4', sourceId: 'root.customer.name', targetId: 'root.customer_name' },
            { id: 'm5', sourceId: 'root.customer.email', targetId: 'root.customer_email' },
        ]

        const { result, errors } = applyMappings(sourceData, mappings, targetTemplate)
        expect(errors).toHaveLength(0)

        const r = result as Record<string, unknown>
        expect(r.customer_name).toBe('John Doe')
        expect(r.customer_email).toBe('john@example.com')
        const order = r.order as Record<string, unknown>
        expect(order.id).toBe('ORD001')
        const amount = order.amount as Record<string, unknown>
        expect(amount.value).toBe(500)
        expect(amount.currency).toBe('USD')
    })

    it('reports error for missing source path', () => {
        const sourceData = { name: 'test' }
        const targetTemplate = { name: '' }

        const mappings: Array<Mapping> = [
            { id: 'm1', sourceId: 'root.missing', targetId: 'root.name' },
        ]

        const { errors } = applyMappings(sourceData, mappings, targetTemplate)
        expect(errors).toHaveLength(1)
        expect(errors[0].message).toContain('not found')
    })
})

describe('generateJSONOutput', () => {
    it('produces indented JSON', () => {
        const data = { a: 1, b: [2, 3] }
        const output = generateJSONOutput(data)
        expect(output).toBe(JSON.stringify(data, null, 2))
    })

    it('handles null', () => {
        expect(generateJSONOutput(null)).toBe('null')
    })
})
