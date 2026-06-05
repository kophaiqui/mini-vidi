import { spawn } from 'child_process';

export interface RunResult {
  stdout: string;
}

/**
 * Spawn a child process and resolve when it exits 0. stderr is kept only as a
 * bounded tail for error messages — video data never flows through Node memory.
 */
export function run(cmd: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = '';
    let stderrTail = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderrTail = (stderrTail + d.toString()).slice(-4000);
    });
    child.on('error', (err) =>
      reject(new Error(`Failed to start ${cmd}: ${err.message}`)),
    );
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout: stdout.trim() });
      else reject(new Error(`${cmd} exited with ${code}: ${stderrTail.trim()}`));
    });
  });
}
