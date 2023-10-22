require('dotenv').config();
const readline = require('readline');
const { spawn } = require('child_process');
const OpenAIApi = require('openai');

// Set up your OpenAI API key
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ORGANIZATION = process.env.OPENAI_API_ORGANIZATION;


const DEFAULT = '\x1b[0m';
const BLACK = '\x1b[30m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BRIGHT_GREEN = '\x1b[38;5;10m';
const ROSE = '\x1b[38;5;9m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';

const BLACK_BG = '\x1b[40m';
const RED_BG = '\x1b[41m';
const GREEN_BG = '\x1b[42m';
const YELLOW_BG = '\x1b[43m';
const BLUE_BG = '\x1b[44m';
const MAGENTA_BG = '\x1b[45m';
const CYAN_BG = '\x1b[46m';
const WHITE_BG = '\x1b[47m';

const SPLITTER = MAGENTA+'================================================================================'+DEFAULT;

const openai = new OpenAIApi({
    key: OPENAI_API_KEY
});


let rl;

let isReadlineOpen = false;

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


function initializeReadline() {

    rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	prompt: CYAN+process.cwd()+BLUE+' nl-cli> '+BRIGHT_GREEN
    });

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
    	    console.error(RED,'Error interacting with OpenAI API:', error.message,DEFAULT);
	    process.exit(0);
	}
    }).on('close', () => {
	isReadlineOpen = false;
    });
    isReadlineOpen = true;
}

function promptUser(){
    if(!isReadlineOpen)
	initializeReadline();
    rl.prompt();
}

process.on('exit', () => {
	console.log(YELLOW,'Have a great day!',DEFAULT);
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
        console.log(YELLOW,`Reply:`,GREEN,` ${reply}`,DEFAULT);

        // Append the assistant's reply to the messages array for context
        messages.push({ role: 'assistant', content: reply });
	interpretResponse(reply);

        // Prompt the user for the next action or continue processing based on the reply
//	promptUser();

    } catch (error) {
        console.error(RED,'Error interacting with OpenAI API:', error.message, DEFAULT);
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
        console.log(YELLOW,`Reply:`,GREEN,` ${reply}`,DEFAULT);

        // Append the assistant's reply to the messages array for context
        messages.push({ role: 'assistant', content: reply });

        // Prompt the user for the next action or continue processing based on the reply
	promptUser();

    } catch (error) {
        console.error(RED,'Error interacting with OpenAI API:', error.message,DEFAULT);
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
    		console.log(YELLOW,`Reply:`,GREEN,` ${reply}`,DEFAULT);

	        // Append the assistant's reply to the messages array for context
	        messages.push({ role: 'assistant', content: reply });

		interpretResponse(reply);

    		// Prompt the user for the next action or continue processing based on the reply
		promptUser();
}

async function interpretResponse(reply){
	let accumulatedOutput = "";
	let stdErr = "";
	const [description, instruction] = reply.split('|CMD|');
	const command = (typeof instruction !== 'undefined')?instruction.trim():null;
	console.log(YELLOW,`Description:`,GREEN,` ${description.trim()}`,DEFAULT);
	console.log(YELLOW,`Suggested Command(s):`,ROSE,` ${command}`,DEFAULT);
	
	if(!isReadlineOpen)initializeReadline();
	if((typeof instruction !== 'undefined')&&(command.length>0))rl.question(YELLOW+'Do you approve the execution of this command? (yes/no) '+BRIGHT_GREEN, (answer) => {
	    if (answer.toLowerCase() === 'yes') {
    		console.log(YELLOW, 'Executing command: ',ROSE,command,YELLOW,'...',DEFAULT);
		console.log(SPLITTER);

//		const fullCommand = `bash -c "${command}"`;
//		const commandParts = fullCommand.split(' ');
		const cmd = `/bin/sh`;
		const args = ['-c', `"${command}"`];

		if(isReadlineOpen)rl.close();
		const child = spawn(command, { shell: true, stdio: ['inherit']});

		child.stdout.on('data', (data) => {
		    const str = data.toString();
	    	    console.log(str);
		    accumulatedOutput += 'STDOUT: '+str;
	        });

		child.stderr.on('data', (data) => {
		    const str = data.toString();
	    	    console.error(RED,str,DEFAULT);
		    accumulatedOutput += 'STDERR: '+str;
		    stdErr+=str;
	        });

		child.on('exit', (code) => {
		    accumulatedOutput += '\n\nPROGRAM TERMINATED. EXIT_CODE: '+code;
		    if(stdErr.length > 0)
			accumulatedOutput += 'STDERR NON-EMPTY. PLEASE CONSIDER THE WHOLE STDERR: '+stdErr;
		    console.log(SPLITTER);
		    console.log(YELLOW,`Child process exited with code ${code}`,DEFAULT);
		    console.log();
		    analyzeOutputWithOpenAI(accumulatedOutput);
		});

/*		exec(cmd, (error, stdout, stderr) => {
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
		});*/
	    } else {
    		console.log(YELLOW,'Command not executed.',DEFAULT);
		rejectedByUser();
	    }
//	    rl.prompt();
	});else promptUser();
//	initializeReadline();
//	rl.prompt();
}

initializeReadline();
rl.prompt();
