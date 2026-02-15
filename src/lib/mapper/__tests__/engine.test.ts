import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseJSON } from '../parsers'
import {
    applyMappings,
    applyTransform,
    evaluateCondition,
    generateJSONOutput,
    treeToData,
} from '../engine'
import type { Mapping, MappingCondition, MappingTransform } from '../types'

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

describe('evaluateCondition', () => {
    const sourceData = {
        name: 'Laptop',
        price: 900,
        category: 'Electronics',
    }

    it('evaluates == with matching string', () => {
        const cond: MappingCondition = { field: 'root.name', operator: '==', value: 'Laptop' }
        expect(evaluateCondition(sourceData, cond)).toBe(true)
    })

    it('evaluates == with non-matching string', () => {
        const cond: MappingCondition = { field: 'root.name', operator: '==', value: 'Phone' }
        expect(evaluateCondition(sourceData, cond)).toBe(false)
    })

    it('evaluates != operator', () => {
        const cond: MappingCondition = { field: 'root.name', operator: '!=', value: 'Phone' }
        expect(evaluateCondition(sourceData, cond)).toBe(true)
    })

    it('evaluates > with numbers', () => {
        const cond: MappingCondition = { field: 'root.price', operator: '>', value: '500' }
        expect(evaluateCondition(sourceData, cond)).toBe(true)
    })

    it('evaluates < with numbers', () => {
        const cond: MappingCondition = { field: 'root.price', operator: '<', value: '500' }
        expect(evaluateCondition(sourceData, cond)).toBe(false)
    })

    it('evaluates >= with numbers', () => {
        const cond: MappingCondition = { field: 'root.price', operator: '>=', value: '900' }
        expect(evaluateCondition(sourceData, cond)).toBe(true)
    })

    it('evaluates <= with numbers', () => {
        const cond: MappingCondition = { field: 'root.price', operator: '<=', value: '900' }
        expect(evaluateCondition(sourceData, cond)).toBe(true)
    })

    it('evaluates contains', () => {
        const cond: MappingCondition = { field: 'root.name', operator: 'contains', value: 'apt' }
        expect(evaluateCondition(sourceData, cond)).toBe(true)
    })

    it('evaluates startsWith', () => {
        const cond: MappingCondition = { field: 'root.name', operator: 'startsWith', value: 'Lap' }
        expect(evaluateCondition(sourceData, cond)).toBe(true)
    })

    it('evaluates endsWith', () => {
        const cond: MappingCondition = { field: 'root.name', operator: 'endsWith', value: 'top' }
        expect(evaluateCondition(sourceData, cond)).toBe(true)
    })

    it('returns false for missing field', () => {
        const cond: MappingCondition = { field: 'root.missing', operator: '==', value: 'x' }
        expect(evaluateCondition(sourceData, cond)).toBe(false)
    })

    it('returns false for null field', () => {
        const data = { value: null }
        const cond: MappingCondition = { field: 'root.value', operator: '==', value: 'x' }
        expect(evaluateCondition(data, cond)).toBe(false)
    })
})

describe('applyTransform', () => {
    it('adds a number', () => {
        expect(applyTransform(100, { type: 'add', value: 50 })).toBe(150)
    })

    it('subtracts a number', () => {
        expect(applyTransform(100, { type: 'subtract', value: 30 })).toBe(70)
    })

    it('multiplies a number', () => {
        expect(applyTransform(100, { type: 'multiply', value: 1.5 })).toBe(150)
    })

    it('divides a number', () => {
        expect(applyTransform(100, { type: 'divide', value: 4 })).toBe(25)
    })

    it('does not divide by zero', () => {
        expect(applyTransform(100, { type: 'divide', value: 0 })).toBe(100)
    })

    it('adds a percentage', () => {
        expect(applyTransform(100, { type: 'add_percent', value: 5 })).toBe(105)
    })

    it('subtracts a percentage', () => {
        expect(applyTransform(200, { type: 'subtract_percent', value: 10 })).toBe(180)
    })

    it('returns non-numeric value as-is', () => {
        expect(applyTransform('hello', { type: 'add', value: 5 })).toBe('hello')
    })

    it('handles string numbers', () => {
        expect(applyTransform('100', { type: 'add', value: 50 })).toBe(150)
    })
})

describe('applyMappings - with conditions and transforms', () => {
    it('skips mapping when condition is not met', () => {
        const sourceData = { price: 30 }
        const targetTemplate = { cost: 0 }

        const mappings: Array<Mapping> = [
            {
                id: 'm1',
                sourceId: 'root.price',
                targetId: 'root.cost',
                condition: { field: 'root.price', operator: '>', value: '50' },
            },
        ]

        const { result } = applyMappings(sourceData, mappings, targetTemplate)
        expect((result as Record<string, unknown>).cost).toBe(0) // not mapped
    })

    it('applies mapping when condition is met', () => {
        const sourceData = { price: 100 }
        const targetTemplate = { cost: 0 }

        const mappings: Array<Mapping> = [
            {
                id: 'm1',
                sourceId: 'root.price',
                targetId: 'root.cost',
                condition: { field: 'root.price', operator: '>', value: '50' },
            },
        ]

        const { result } = applyMappings(sourceData, mappings, targetTemplate)
        expect((result as Record<string, unknown>).cost).toBe(100)
    })

    it('applies transform to mapped value', () => {
        const sourceData = { price: 100 }
        const targetTemplate = { cost: 0 }

        const mappings: Array<Mapping> = [
            {
                id: 'm1',
                sourceId: 'root.price',
                targetId: 'root.cost',
                transform: { type: 'add_percent', value: 5 },
            },
        ]

        const { result } = applyMappings(sourceData, mappings, targetTemplate)
        expect((result as Record<string, unknown>).cost).toBe(105)
    })

    it('applies condition + transform together', () => {
        const sourceData = { price: 100 }
        const targetTemplate = { cost: 0 }

        const mappings: Array<Mapping> = [
            {
                id: 'm1',
                sourceId: 'root.price',
                targetId: 'root.cost',
                condition: { field: 'root.price', operator: '>', value: '40' },
                transform: { type: 'add_percent', value: 5 },
            },
        ]

        const { result } = applyMappings(sourceData, mappings, targetTemplate)
        expect((result as Record<string, unknown>).cost).toBe(105)
    })

    it('skips condition + transform when condition fails', () => {
        const sourceData = { price: 20 }
        const targetTemplate = { cost: 0 }

        const mappings: Array<Mapping> = [
            {
                id: 'm1',
                sourceId: 'root.price',
                targetId: 'root.cost',
                condition: { field: 'root.price', operator: '>', value: '40' },
                transform: { type: 'add_percent', value: 5 },
            },
        ]

        const { result } = applyMappings(sourceData, mappings, targetTemplate)
        expect((result as Record<string, unknown>).cost).toBe(0) // not mapped
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
