async function main() {
  try {
    const token = '6P2H8U3q7Nly6L0a5S9d4F3g';
    const projectId = 'prj_gHExFxyfgpWAf91GDirXGYf8bnO4';
    const teamId = 'team_BZmPqFwzh398RsZHy8Lkd3jj';
    
    console.log('Updating project settings on Vercel...');
    
    const response = await fetch(`https://api.vercel.com/v9/projects/${projectId}?teamId=${teamId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rootDirectory: null,
        outputDirectory: 'dist',
        framework: null,
        buildCommand: 'pnpm run vercel-build',
        installCommand: 'pnpm install --no-frozen-lockfile'
      })
    });

    const resJson = await response.json();
    if (!response.ok) {
      throw new Error(`Failed to update project: ${JSON.stringify(resJson)}`);
    }

    console.log('Project settings updated successfully!');
    console.log(JSON.stringify(resJson, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
