import { describe, expect, it } from 'vitest'
import { generateDSL, parseDSL } from '../dsl'
import type { Mapping } from '../types'

describe('parseDSL', () => {
    it('parses a single mapping line', () => {
        const { mappings, errors } = parseDSL('user.name -> customer.fullName')
        expect(errors).toHaveLength(0)
        expect(mappings).toHaveLength(1)
        expect(mappings[0].sourceId).toBe('root.user.name')
        expect(mappings[0].targetId).toBe('root.customer.fullName')
    })

    it('parses multiple mapping lines', () => {
        const dsl = `
user.name -> customer.name
user.email -> customer.email
user.age -> customer.age
`
        const { mappings, errors } = parseDSL(dsl)
        expect(errors).toHaveLength(0)
        expect(mappings).toHaveLength(3)
    })

    it('skips blank lines', () => {
        const dsl = `
a -> b

c -> d
`
        const { mappings, errors } = parseDSL(dsl)
        expect(errors).toHaveLength(0)
        expect(mappings).toHaveLength(2)
    })

    it('skips comment lines starting with #', () => {
        const dsl = `# This is a comment
a -> b
# Another comment
c -> d`
        const { mappings, errors } = parseDSL(dsl)
        expect(errors).toHaveLength(0)
        expect(mappings).toHaveLength(2)
    })

    it('skips comment lines starting with //', () => {
        const dsl = `// comment
a -> b`
        const { mappings, errors } = parseDSL(dsl)
        expect(errors).toHaveLength(0)
        expect(mappings).toHaveLength(1)
    })

    it('reports error for invalid syntax', () => {
        const { mappings, errors } = parseDSL('not a valid line')
        expect(mappings).toHaveLength(0)
        expect(errors).toHaveLength(1)
        expect(errors[0].line).toBe(1)
        expect(errors[0].message).toContain('Invalid syntax')
    })

    it('handles paths already prefixed with root', () => {
        const { mappings } = parseDSL('root.a -> root.b')
        expect(mappings[0].sourceId).toBe('root.a')
        expect(mappings[0].targetId).toBe('root.b')
    })

    it('handles array index paths', () => {
        const { mappings, errors } = parseDSL('items[0].name -> output[0].label')
        expect(errors).toHaveLength(0)
        expect(mappings[0].sourceId).toBe('root.items[0].name')
        expect(mappings[0].targetId).toBe('root.output[0].label')
    })

    it('assigns line-based IDs', () => {
        const dsl = `a -> b
c -> d`
        const { mappings } = parseDSL(dsl)
        expect(mappings[0].id).toBe('dsl-1')
        expect(mappings[1].id).toBe('dsl-2')
    })
})

describe('generateDSL', () => {
    it('generates DSL from mappings', () => {
        const mappings: Array<Mapping> = [
            { id: 'm1', sourceId: 'root.user.name', targetId: 'root.customer.fullName' },
            { id: 'm2', sourceId: 'root.user.email', targetId: 'root.customer.email' },
        ]

        const dsl = generateDSL(mappings)
        const lines = dsl.split('\n')
        expect(lines).toHaveLength(2)
        expect(lines[0]).toBe('user.name -> customer.fullName')
        expect(lines[1]).toBe('user.email -> customer.email')
    })

    it('strips root prefix from paths', () => {
        const mappings: Array<Mapping> = [
            { id: 'm1', sourceId: 'root.a', targetId: 'root.b' },
        ]
        expect(generateDSL(mappings)).toBe('a -> b')
    })

    it('returns empty string for no mappings', () => {
        expect(generateDSL([])).toBe('')
    })

    it('round-trips: parseDSL(generateDSL(m)) reproduces paths', () => {
        const original: Array<Mapping> = [
            { id: 'm1', sourceId: 'root.order.id', targetId: 'root.orderId' },
            { id: 'm2', sourceId: 'root.items[0].sku', targetId: 'root.productCode' },
        ]

        const dsl = generateDSL(original)
        const { mappings } = parseDSL(dsl)

        expect(mappings).toHaveLength(2)
        expect(mappings[0].sourceId).toBe('root.order.id')
        expect(mappings[0].targetId).toBe('root.orderId')
        expect(mappings[1].sourceId).toBe('root.items[0].sku')
        expect(mappings[1].targetId).toBe('root.productCode')
    })
})
