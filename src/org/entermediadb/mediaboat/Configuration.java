package org.entermediadb.mediaboat;

import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.util.Properties;

public class Configuration
{
	protected String HOME= null;
	Properties properties= null;
	public Configuration(String inHome)
	{
		HOME = inHome;
	}
	public String get(String inKey)
	{
		return getProps().getProperty(inKey);
	}
	
	public void put(String inKey, String inValue)
	{
		getProps().setProperty(inKey,inValue);
	}
	public void save()
	{
		String homepath = System.getenv("HOME") != null && !System.getenv("HOME").trim().isEmpty()
				? System.getenv("HOME")
				: System.getenv("HOMEPATH");
		File input = new File(homepath + "/.mediaboat.properties");
		FileWriter writer  = null;
		try
		{
			writer = new FileWriter(input);
			getProps().store(writer,"saved by mediaboat");
			
		} catch (Exception ex)
		{
			throw new RuntimeException(ex);
		}
		finally
		{
			close(writer);
		}
	}
	private void close(FileWriter inWriter)
	{
		// TODO Auto-generated method stub
		
	}
	
	public Properties getProps()
	{
		if (properties == null)
		{
			String homepath = System.getenv("HOME") != null && !System.getenv("HOME").trim().isEmpty()
				? System.getenv("HOME")
				: System.getenv("HOMEPATH");
			properties = new Properties();
			File input = new File(homepath +   "/.mediaboat.properties");
			if( !input.exists())
			{
				input.getParentFile().mkdirs();
				//properties.storeToXML(os, comment, encoding);(out, comments);
			}
			else
			{
				FileReader reader = null;
				try
				{
					reader = new FileReader(input);
					properties.load(reader);
				}
				catch (Exception e)
				{
					new RuntimeException(e);
				}
				finally
				{
					close(reader);
				}
			}
		}
		
		return properties;
	}
	
	private void close(FileReader inReader)
	{
		// TODO Auto-generated method stub
		
	}
	
}
