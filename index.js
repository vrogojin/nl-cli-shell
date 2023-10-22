require('dotenv').config();
const readline = require('readline');
const { exec } = require('child_process');
const OpenAIApi = require('openai');

// Set up your OpenAI API key
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ORGANIZATION = process.env.OPENAI_API_ORGANIZATION;

const openai = new OpenAIApi({
    key: OPENAI_API_KEY
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'nl-cli> '
});

let messages = [
    {role: 'system', content: `You are an AI agent for CLI shell.
    You are interpreting user's requests in natural language 
    and submitting back to the user's environment a suggetion for a sequence of BASH commands
    to be executed at user's environment in order to satisfy the request. You will be
    explaining in natural language what you are going to execute and how it solves 
    the user's request. You form your responce as follows: <your-description-in-natural-language>|CMD|<first-command-suitable-for-execution>.
    IMPORTANT: DO NOT USE SUBSTRING |CMD| inside the natural language description, only after it!
    CLI shell software at user's side will interpret you response: first it will ask the user if he/she
    agrees to your solution as is and will ask for any amendments from user side, then it will execute the command after |CMD| substring.
    After execution of each command, user's 
    CLI shell will be streaming the command's STDOUT to you as the next chat completions query,
    so that you could analyze the results and decide whether the remaining sequence of commands needs an
    amendment. If so, you suggest the amendment. Proceed further if the user is happy. Remember: you can do
    (with the user permission) anything the user can do him/herself on her machine by running BASH commands.
    Also, remember that you cannot handle prompts larger than 4096 points, so try making commands less verbose.`},
    {role: 'assistant', content: 'you can list a directory with "ls", read a file with "cat", write a new file with "echo >", etc.'}
];

rl.prompt();

rl.on('line', async (line) => {
    messages.push({role: 'user', content: line.trim()});
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4',  // Adjust the model if needed
	    messages: messages
        });
	const reply = response.choices[0].message.content.trim();
	messages.push({role: 'assistant', content: reply});
	interpretResponse(reply);
    } catch (error) {
        console.error('Error interacting with OpenAI API:', error.message);
	process.exit(0);
    }
//    rl.prompt();
}).on('close', () => {
    console.log('Have a great day!');
    process.exit(0);
});

async function analyzeOutputWithOpenAI(output) {
    try {
        // Use the output as part of your message to OpenAI
        messages.push({ role: 'user', content: `The output of the last command was: ${output}. What shall we do next? 
	Suggest the next command if any for execution after |CMD|` });

        const response = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: messages
        });

        const reply = response.choices[0].message.content.trim();
        console.log(`Reply: ${reply}`);

        // Append the assistant's reply to the messages array for context
        messages.push({ role: 'assistant', content: reply });
	interpretResponse(reply);

        // Prompt the user for the next action or continue processing based on the reply
        rl.prompt();

    } catch (error) {
        console.error('Error interacting with OpenAI API:', error.message);
	process.exit(0);
    }
}

async function executionError(err) {
    try {
        // Use the output as part of your message to OpenAI
        messages.push({ role: 'user', content: `Execution of the last command failed: ${err}. What shell we do next?
	Suggest the next command if any for execution after |CMD|` });

        const response = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: messages
        });

        const reply = response.choices[0].message.content.trim();
        console.log(`Reply: ${reply}`);

        // Append the assistant's reply to the messages array for context
        messages.push({ role: 'assistant', content: reply });

        // Prompt the user for the next action or continue processing based on the reply
        rl.prompt();

    } catch (error) {
        console.error('Error interacting with OpenAI API:', error.message);
	process.exit(0);
    }
}


async function rejectedByUser(){
		messages.push({ role: 'user', content: `I rejected your suggestion and did not execute the command. Ask me what are we doing next.` });

    		const response = await openai.chat.completions.create({
	            model: 'gpt-4',
    		    messages: messages
	        });

	        const reply = response.choices[0].message.content.trim();
    		console.log(`Reply: ${reply}`);

	        // Append the assistant's reply to the messages array for context
	        messages.push({ role: 'assistant', content: reply });

		interpretResponse(reply);

    		// Prompt the user for the next action or continue processing based on the reply
	        rl.prompt();

}

async function interpretResponse(reply){
	const [description, command] = reply.split('|CMD|');
	const cmd = (typeof command !== 'undefined')?command.trim():null;
	console.log(`Description: ${description.trim()}`);
	console.log(`Suggested Command(s): ${cmd}`);
	
	if((typeof command !== 'undefined')&&(cmd.length>0))rl.question('Do you approve the execution of this command? (yes/no) ', (answer) => {
	    if (answer.toLowerCase() === 'yes') {
    		console.log('Executing command...');
		exec(cmd, (error, stdout, stderr) => {
    		    if (error) {
        		console.error(`Execution Error: ${error}`);
			executionError(error);
        		return;
    		    }
    		    if (stderr) {
        		console.error(`STDERR: ${stderr}`);
			executionError(stderr);
    		    }

    		    console.log(`STDOUT: ${stdout}`);
    		    // Now, send `stdout` or any other relevant info back to OpenAI for further analysis
    		    analyzeOutputWithOpenAI(stdout);
		});
	    } else {
    		console.log('Command not executed.');
		rejectedByUser();
	    }
//	    rl.prompt();
	});else rl.prompt();
}