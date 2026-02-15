import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { detectFileType, parseJSON } from '../parsers'
import type { TreeNode } from '../types'

const samplesDir = resolve(__dirname, '../../../../BasicMapperTestingSamples')

function loadSample(name: string): string {
    return readFileSync(resolve(samplesDir, name), 'utf-8')
}

/** Collect all nodes in a tree via DFS */
function collectNodes(node: TreeNode): Array<TreeNode> {
    const nodes: Array<TreeNode> = [node]
    for (const child of node.children ?? []) {
        nodes.push(...collectNodes(child))
    }
    return nodes
}

describe('detectFileType', () => {
    it('detects JSON by leading brace', () => {
        expect(detectFileType('{ "a": 1 }')).toBe('json')
    })

    it('detects JSON by leading bracket', () => {
        expect(detectFileType('  [1, 2]')).toBe('json')
    })

    it('detects XML by leading angle bracket', () => {
        expect(detectFileType('  <root><a>1</a></root>')).toBe('xml')
    })

    it('defaults to json for non-XML content', () => {
        expect(detectFileType('hello')).toBe('json')
    })
})

describe('parseJSON', () => {
    describe('sample1 — flat object', () => {
        const tree = parseJSON(loadSample('sampleInput1.json'))

        it('root is an object node', () => {
            expect(tree.type).toBe('object')
            expect(tree.id).toBe('root')
        })

        it('has correct top-level keys', () => {
            const keys = tree.children!.map((c) => c.key)
            expect(keys).toEqual(['id', 'first_name', 'last_name', 'age'])
        })

        it('all children are primitives', () => {
            for (const child of tree.children!) {
                expect(child.type).toBe('primitive')
            }
        })

        it('preserves rawValue types', () => {
            const idNode = tree.children!.find((c) => c.key === 'id')!
            // sampleInput1 has "id": "101" (string)
            expect(idNode.rawValue).toBe('101')
            expect(typeof idNode.rawValue).toBe('string')
        })
    })

    describe('sample2 — nested object', () => {
        const tree = parseJSON(loadSample('sampleInput2.json'))

        it('has a nested customer object', () => {
            const customer = tree.children!.find((c) => c.key === 'customer')!
            expect(customer.type).toBe('object')
            expect(customer.depth).toBe(1)
            expect(customer.children!.length).toBe(2)
        })

        it('nested children have correct depth', () => {
            const customer = tree.children!.find((c) => c.key === 'customer')!
            for (const child of customer.children!) {
                expect(child.depth).toBe(2)
            }
        })

        it('preserves number rawValue for total', () => {
            const total = tree.children!.find((c) => c.key === 'total')!
            expect(total.rawValue).toBe(500)
            expect(typeof total.rawValue).toBe('number')
        })
    })

    describe('sample3 — array of objects', () => {
        const tree = parseJSON(loadSample('sampleInput3.json'))

        it('products child is an array node', () => {
            const products = tree.children!.find((c) => c.key === 'products')!
            expect(products.type).toBe('array')
        })

        it('array children are indexed as [0], [1]', () => {
            const products = tree.children!.find((c) => c.key === 'products')!
            expect(products.children!.length).toBe(2)
            expect(products.children![0].key).toBe('[0]')
            expect(products.children![1].key).toBe('[1]')
        })

        it('array element children have correct types', () => {
            const products = tree.children!.find((c) => c.key === 'products')!
            const first = products.children![0]
            expect(first.type).toBe('object')

            const idNode = first.children!.find((c) => c.key === 'id')!
            expect(idNode.rawValue).toBe(1)
            expect(typeof idNode.rawValue).toBe('number')

            const priceNode = first.children!.find((c) => c.key === 'price')!
            expect(priceNode.rawValue).toBe(900)
        })
    })

    describe('sample4 — nested object with nested object', () => {
        const tree = parseJSON(loadSample('sampleInput4.json'))

        it('employee is a nested object', () => {
            const employee = tree.children!.find((c) => c.key === 'employee')!
            expect(employee.type).toBe('object')
            expect(employee.children!.length).toBe(4)
        })

        it('deep nodes have correct IDs', () => {
            const employee = tree.children!.find((c) => c.key === 'employee')!
            const salary = employee.children!.find((c) => c.key === 'salary')!
            expect(salary.id).toBe('root.employee.salary')
            expect(salary.rawValue).toBe(70000)
        })
    })

    describe('sample5 — 2-level deep nested source', () => {
        const tree = parseJSON(loadSample('sampleInput5.json'))

        it('has 3 levels of nesting', () => {
            const shipment = tree.children!.find((c) => c.key === 'shipment')!
            const origin = shipment.children!.find((c) => c.key === 'origin')!
            const city = origin.children!.find((c) => c.key === 'city')!
            expect(city.depth).toBe(3)
            expect(city.id).toBe('root.shipment.origin.city')
            expect(city.rawValue).toBe('New York')
        })
    })

    describe('sample6 — arrays in source', () => {
        const tree = parseJSON(loadSample('sampleInput6.json'))

        it('has products array', () => {
            const products = tree.children!.find((c) => c.key === 'products')!
            expect(products.type).toBe('array')
            expect(products.children!.length).toBe(2)
        })

        it('array items contain expected keys', () => {
            const products = tree.children!.find((c) => c.key === 'products')!
            const first = products.children![0]
            const keys = first.children!.map((c) => c.key)
            expect(keys).toEqual(['sku', 'qty'])
        })

        it('preserves number types in array items', () => {
            const products = tree.children!.find((c) => c.key === 'products')!
            const first = products.children![0]
            const qty = first.children!.find((c) => c.key === 'qty')!
            expect(qty.rawValue).toBe(2)
            expect(typeof qty.rawValue).toBe('number')
        })
    })

    describe('root-level array (sampleOutput6)', () => {
        const tree = parseJSON(loadSample('sampleOutput6.json'))

        it('root node is an array', () => {
            expect(tree.type).toBe('array')
        })

        it('array items are objects', () => {
            expect(tree.children![0].type).toBe('object')
        })

        it('preserves zero as number', () => {
            const first = tree.children![0]
            const qty = first.children!.find((c) => c.key === 'quantity')!
            expect(qty.rawValue).toBe(0)
            expect(typeof qty.rawValue).toBe('number')
        })
    })

    describe('node ID uniqueness', () => {
        it('all node IDs are unique within a tree', () => {
            const tree = parseJSON(loadSample('sampleInput3.json'))
            const allNodes = collectNodes(tree)
            const ids = allNodes.map((n) => n.id)
            expect(new Set(ids).size).toBe(ids.length)
        })
    })
})
