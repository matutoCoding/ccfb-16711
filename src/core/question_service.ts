import { buildWorldPrimitives } from './geometry'
import { getItemDef } from './items/item_registry'
import { buildQuestion, randomPack, type RandomPackOptions } from './packing'
import { voxelize, type VoxelScene } from './voxelizer'
import type { GroundTruth, LuggageDef, Question } from './types'

// 组包 -> 体素化 -> 投影生成 GroundTruth
export const renderLuggageToScene = (luggage: LuggageDef, resolution: number): VoxelScene => {
  const prims = buildWorldPrimitives(luggage)
  return voxelize(luggage, prims, resolution)
}

export const createQuestionFromLuggage = (
  luggage: LuggageDef,
  resolution: number,
  timeLimitSec: number,
): { question: Question; scene: VoxelScene } => {
  const scene = renderLuggageToScene(luggage, resolution)
  const targets: GroundTruth[] = []
  for (const placed of luggage.items) {
    const def = getItemDef(placed.itemId)
    if (def.category !== 'contraband') continue
    const proj = scene.projections.find((p) => p.uid === placed.uid)
    if (!proj) continue
    targets.push({
      uid: placed.uid,
      itemId: def.id,
      name: def.name,
      contrabandClass: def.contrabandClass!,
      bbox: proj.bbox,
      occlusion: proj.occlusion,
    })
  }
  const question = buildQuestion(luggage, targets, timeLimitSec)
  return { question, scene }
}

export const createRandomQuestion = (
  opts: RandomPackOptions,
  resolution: number,
  timeLimitSec: number,
): { question: Question; scene: VoxelScene } => {
  const luggage = randomPack(opts)
  return createQuestionFromLuggage(luggage, resolution, timeLimitSec)
}
