--!native
--!optimize 2

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local MSRECS = require(ReplicatedStorage:WaitForChild("MSRECS"))

local World = MSRECS.World
local defineComponent = MSRECS.defineComponent

type VectorComponent = {
	x: number,
	y: number,
}

local Position = defineComponent("BenchmarkPosition")
local Velocity = defineComponent("BenchmarkVelocity")
local Health = defineComponent("BenchmarkHealth")

local function runBenchmark(name, iterations, callback)
	for _ = 1, 5 do
		callback()
	end

	local startedAt = os.clock()

	for _ = 1, iterations do
		callback()
	end

	local elapsed = os.clock() - startedAt
	local average = (elapsed / iterations) * 1000

	print(string.format("[MSRECS] %s: %.3fms avg over %d runs", name, average, iterations))
end

runBenchmark("create 10,000 entities", 25, function()
	local world = World.new()

	for _ = 1, 10000 do
		world:createEntity()
	end
end)

runBenchmark("set/get 10,000 position components", 25, function()
	local world = World.new()
	local entities = table.create(10000)

	for index = 1, 10000 do
		local entity = world:createEntity()
		entities[index] = entity
		world:set(entity, Position, { x = index, y = index })
	end

	for _, entity in entities do
		world:get(entity, Position)
	end
end)

runBenchmark("query 10,000 entities with two components", 25, function()
	local world = World.new()

	for index = 1, 10000 do
		local entity = world:createEntity()
		world:set(entity, Position, { x = index, y = index })

		if index % 2 == 0 then
			world:set(entity, Velocity, { x = 1, y = 1 })
		end
	end

	world:query(Position, Velocity)
end)

runBenchmark("cached query 10,000 entities with two components", 25, function()
	local world = World.new()

	for index = 1, 10000 do
		local entity = world:createEntity()
		world:set(entity, Position, { x = index, y = index })

		if index % 2 == 0 then
			world:set(entity, Velocity, { x = 1, y = 1 })
		end
	end

	world:queryCached(Position, Velocity)
	world:queryCached(Position, Velocity)
end)

runBenchmark("query object over 5,000 matching entities", 25, function()
	local world = World.new()

	for index = 1, 10000 do
		local entity = world:createEntity()
		world:set(entity, Position, { x = index, y = index })

		if index % 2 == 0 then
			world:set(entity, Velocity, { x = 1, y = 1 })
		end
	end

	local query = world:queryObject({ Position, Velocity })
	query:each(function(_, position: VectorComponent, velocity: VectorComponent)
		position.x += velocity.x
		position.y += velocity.y
	end)
end)

runBenchmark("queryEach movement over 5,000 matching entities", 25, function()
	local world = World.new()

	for index = 1, 10000 do
		local entity = world:createEntity()
		world:set(entity, Position, { x = index, y = index })

		if index % 2 == 0 then
			world:set(entity, Velocity, { x = 1, y = 1 })
		end
	end

	world:queryEach({ Position, Velocity }, function(_, position: VectorComponent, velocity: VectorComponent)
		position.x += velocity.x
		position.y += velocity.y
	end)
end)

runBenchmark("query 10,000 entities with three components", 25, function()
	local world = World.new()

	for index = 1, 10000 do
		local entity = world:createEntity()
		world:set(entity, Position, { x = index, y = index })
		world:set(entity, Health, { current = 100, max = 100 })

		if index % 2 == 0 then
			world:set(entity, Velocity, { x = 1, y = 1 })
		end
	end

	world:query(Position, Velocity, Health)
end)

runBenchmark("flush command buffer with 10,000 component writes", 25, function()
	local world = World.new()
	local commands = world:commands()

	for index = 1, 10000 do
		local entity = commands:spawn()
		commands:set(entity, Position, { x = index, y = index })
	end

	commands:flush(world)
end)

runBenchmark("snapshot and restore 10,000 positioned entities", 10, function()
	local world = World.new()

	for index = 1, 10000 do
		local entity = world:createEntity()
		world:set(entity, Position, { x = index, y = index })
	end

	local snapshot = world:snapshot()
	world:restore(snapshot)
end)
