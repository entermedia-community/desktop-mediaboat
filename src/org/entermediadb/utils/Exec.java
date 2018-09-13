/*
 * Created on May 4, 2006
 */
package org.entermediadb.utils;

import java.io.File;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;

public class Exec
{
	private static final Log log = LogFactory.getLog(Exec.class);

	protected long fieldTimeLimit = 3600000L; //1h max, make video conversions be longer

	protected String fieldXmlCommandsFilename;
	protected File fieldRoot;
	protected OutputFiller fieldFiller;
	protected Boolean fieldOnWindows;
	protected ExecutorManager fieldExecutorManager;
	public Exec()
	{
	}

	public ExecutorManager getExecutorManager()
	{
		if (fieldExecutorManager == null)
		{
			fieldExecutorManager = new ExecutorManager();
		}
		return fieldExecutorManager;
	}

	public void setExecutorManager(ExecutorManager inExecutorManager)
	{
		fieldExecutorManager = inExecutorManager;
	}

	public OutputFiller getFiller()
	{
		if (fieldFiller == null)
		{
			fieldFiller = new OutputFiller();
		}
		return fieldFiller;
	}


	public long getTimeLimit()
	{
		return fieldTimeLimit;
	}

	public void setTimeLimit(long inTimelimit)
	{
		fieldTimeLimit = inTimelimit;
	}

	public ExecResult runExec(String inCommand, Collection<String> inArgs)
	{
		return runExec(inCommand, inArgs, false, getTimeLimit());
	}

	public ExecResult runExec(String inCommand, Collection<String> args,boolean inSaveOutput, long inTimeout) throws RuntimeException
	{
		List com = new ArrayList(args.size() + 1);
		com.add(inCommand);
		com.addAll(args);
		log.info("Running: " + com); 
		
		if( inTimeout == -1)
		{
			inTimeout = getTimeLimit();
		}
		log.info("Running: " + com); 

		FinalizedProcessBuilder pb = new FinalizedProcessBuilder(com).keepProcess(false).logInputtStream(inSaveOutput);
		ExecResult result = new ExecResult();
		try
		{
			FinalizedProcess process = pb.start(getExecutorManager());
			try
			{
				int returnVal = process.waitFor(inTimeout);
				
				if (inSaveOutput)
				{
					result.setStandardOut(process.getStandardOutputs());
				}
				if (returnVal == 0) 
				{
					result.setRunOk(true); 
				} 
				result.setReturnValue(returnVal);
				
			}
			finally
			{
				//Stream should be read in fully then it returns the code
				process.close();
			}
		}
		catch (Exception ex)
		{
			log.error(ex);
			result.setRunOk(false);
			result.setReturnValue(1); //0 is success 1 is error
			String error = result.getStandardError(); 
			if(error == null)
			{
				error = "";
			}
			error = error + ex.toString();
			result.setStandardError(error);
		}
		return result;
	}


	public String getXmlCommandsFilename()
	{
		return fieldXmlCommandsFilename;
	}

	public void setXmlCommandsFilename(String xmlCommands)
	{
		fieldXmlCommandsFilename = xmlCommands;
	}


	public File getRoot()
	{
		return fieldRoot;
	}

	public void setRoot(File root)
	{
		fieldRoot = root;
	}

	public String makeAbsolute(String inCommandBase)
	{
		if (inCommandBase.startsWith("./"))
		{
			inCommandBase = new File(getRoot(), inCommandBase.substring(2)).getAbsolutePath();
		}
		if (!inCommandBase.endsWith("/"))
		{
			inCommandBase += "/";
		}
		return inCommandBase;
	}

	public Boolean isOnWindows()
	{
		if (fieldOnWindows == null)
		{
			if (System.getProperty("os.name").toUpperCase().contains("WINDOWS"))
			{
				fieldOnWindows = Boolean.TRUE;
			}
			else
			{
				fieldOnWindows = Boolean.FALSE;
			}

		}
		return fieldOnWindows;
	}

	public void setIsOnWindows(boolean inBoolean)
	{
		fieldOnWindows = inBoolean;
	}


}
