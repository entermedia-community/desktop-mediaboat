package org.entermediadb.mediaboat;

import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.util.Properties;

public class Configuration
{
	
	Properties properties= null;
	
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
		File input = new File(System.getenv("HOME") +   "/entermedia/mediaboat.properties");
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
			properties = new Properties();
			File input = new File(System.getenv("HOME") +   "/entermedia/mediaboat.properties");
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
