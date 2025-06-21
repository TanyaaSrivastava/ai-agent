import { Assistants } from 'openai/resources/beta.js';
import { db } from './db/index.js';
import { todosTable } from './db/schema.js';
import {ilike, eq} from 'drizzle-orm';
import OpenAI from 'openai';
import { DatabaseError } from 'pg';
import  readlinkSync  from 'readline-sync';
import 'dotenv/config'; 


const client = new OpenAI();

//tools
async function getAllTodos() {
    const todos = await db.select().from(todosTable);
    return todos;
}
async function createTodo(todo) {
    const [result] = await db
    .insert(todosTable)
    .value({
        todo,
    })
    .returning({
        id: todosTable.id,
    });
    return todo.id;
}
async function deleteTodoby(id) {
    await db.delete(todosTable).where(eq(todosTable.id, id));
}

async function searchTodo(search) {
    const todos = await db
    .select()
    .from(todosTable)
    .where(ilike(todosTable.todo, search));
    return todos;
}

const tools = {
    getAllTodos: getAllTodos,
    createTodo: createTodo,
    deleteTodoby: deleteTodoby,
    searchTodo: searchTodo
}
const SYSTEM_PROMPT = `
You are an AI To-do Assistance with START, PLAN, ACTION, observation and output state.
Wait for the user prompt and first PLAN using avaiable tools.
After planning, take the action with appropriate tools and wait for the observation based on actions.
Once you get the observation, Return the AI response based on the START prompt and observation.

You can manage tasks by adding ,viewing , updating and Deleting .
you must strictly follow the json format.

Todo
id:Int and Primary key
todo: String
created_at: Date Time
updated_at: Date Time


Available Tools:
- getAllTodos(): Return all the todos from Database
- createTodo(todo: string): Creates a new todo in the DB and takes todo as a string
- deleteTodoById(id: string ): Delete the todo by Id given in the DB
- serachTodo(query: string): Seraches for all todos

Example:
START
{"type":"user","user":"add a task for shopping groceries". }
{"type":"plan","plan":"i will try to get more context ". }
{"type":"output","output":"can you tell me what items you want to shop for?". }
{"type":"user","user":"i want to shop for milk and choco". }

`;

const messages = [{role: 'system',content:SYSTEM_PROMPT }];
while(true) {
    const query = readlinkSync.question('>>');
    const userMessage = {
        type: 'user',
        user: query,
    };
    messages.push({role: 'user', content: JSON.stringify(userMessage)});

    while (true) {
        const chat = await client.chat.completions.create({
            model: 'gpt-4o',
            messages: messages,
            response_format: {type: 'json_object'},
        });
        const result = chat.choices[0].message.content;
        messages.push({role: 'assistant', content:result });

        const action = JSON.parse(result);
        if(action.type === 'output') {
            console.log(`$(action.output)`);
            break;
        } else if (action.type === 'action'){
            const fn = tools[action.function];
            if (!fn) throw new Error('Invalid tool case');
            const observation = fn(action.input);
            const observationMessage = {
                type: 'observation',
                observation: observation,
            };
            messages.push({role: 'developer', content: JSON.stringify(observationMessage)});
        }
    }
}